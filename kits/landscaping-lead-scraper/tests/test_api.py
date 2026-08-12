import pytest

fastapi = pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from leadscraper.models import Lead, SourceResult
from leadscraper.pipeline import SearchOutcome
from leadscraper.service.app import create_app
from leadscraper.service.jobs import JobRunner
from leadscraper.service.store import Store

TOKEN = "test-token"


def canned_outcome():
    leads = [
        Lead(source="Craigslist", title="Need mowing",
             url="https://example.craigslist.org/wan/d/1.html", phone="512-555-0134"),
        Lead(source="Google Places", title="Hill Country PM",
             url="https://hcpm.example.com", phone="512-555-0188",
             address="100 Congress Ave"),
    ]
    return SearchOutcome(
        leads=leads,
        results=[
            SourceResult(name="Craigslist", leads=[leads[0]],
                         warnings=["hss: no such city/category board"]),
            SourceResult(name="Google Places", leads=[leads[1]]),
        ],
        skipped=["Facebook skipped (pass --facebook-group to enable)"],
    )


class InlineRunner(JobRunner):
    """Runs the search synchronously on submit — deterministic, no threads."""

    def submit(self, job_id, req):
        self._run(job_id, req)


@pytest.fixture
def client(tmp_path):
    store = Store(str(tmp_path / "api.db"))
    runner = InlineRunner(store, search=lambda req, **kw: canned_outcome())
    app = create_app(store=store, runner=runner, token=TOKEN)
    return TestClient(app)


def auth():
    return {"Authorization": f"Bearer {TOKEN}"}


class TestAuth:
    def test_health_is_open(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_page_is_open(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        assert "tel:" in resp.text  # tap-to-dial wiring present
        assert "Add to Home Screen" in resp.text or "apple-mobile-web-app" in resp.text

    def test_api_requires_token(self, client):
        assert client.get("/api/leads").status_code == 401
        assert client.get("/api/leads", headers={"Authorization": "Bearer wrong"}).status_code == 401

    def test_api_accepts_token(self, client):
        assert client.get("/api/leads", headers=auth()).status_code == 200


class TestSearchLifecycle:
    def test_submit_poll_done(self, client):
        resp = client.post("/api/searches", json={"city": "austin", "state": "texas"}, headers=auth())
        assert resp.status_code == 202
        job_id = resp.json()["job_id"]

        job = client.get(f"/api/searches/{job_id}", headers=auth()).json()
        assert job["status"] == "done"
        assert job["found"] == 2
        assert job["new_count"] == 2
        names = {s["name"]: s for s in job["sources"]}
        assert names["Craigslist"]["count"] == 1
        assert names["Craigslist"]["warnings"] == ["hss: no such city/category board"]
        assert names["Google Places"]["ok"] is True

        leads = client.get("/api/leads", headers=auth()).json()
        assert leads["total"] == 2

    def test_409_when_running(self, client, tmp_path):
        # a queued job that never starts simulates "busy"
        store = Store(str(tmp_path / "busy.db"))
        running_id = store.create_job({"city": "austin"})

        class NeverRuns(JobRunner):
            def submit(self, job_id, req):
                pass

        app = create_app(store=store, runner=NeverRuns(store), token=TOKEN)
        busy_client = TestClient(app)
        resp = busy_client.post("/api/searches", json={"city": "dallas"}, headers=auth())
        assert resp.status_code == 409
        assert resp.json()["job_id"] == running_id

    def test_unknown_job_404(self, client):
        assert client.get("/api/searches/nope", headers=auth()).status_code == 404

    def test_cancel(self, client, tmp_path):
        store = Store(str(tmp_path / "cancel.db"))
        job_id = store.create_job({})

        class NeverRuns(JobRunner):
            def submit(self, job_id, req):
                pass

        app = create_app(store=store, runner=NeverRuns(store), token=TOKEN)
        c = TestClient(app)
        resp = c.post(f"/api/searches/{job_id}/cancel", headers=auth())
        assert resp.status_code == 202
        assert store.is_cancelled(job_id)


class TestValidation:
    def test_path_traversal_category_dies_at_the_boundary(self, client):
        resp = client.post("/api/searches",
                           json={"city": "austin", "categories": ["../.."]},
                           headers=auth())
        assert resp.status_code == 422

    def test_empty_city_rejected(self, client):
        assert client.post("/api/searches", json={"city": ""}, headers=auth()).status_code == 422

    def test_max_per_source_capped(self, client):
        resp = client.post("/api/searches",
                           json={"city": "austin", "max_per_source": 100000},
                           headers=auth())
        assert resp.status_code == 422

    def test_no_places_key_or_facebook_fields_accepted(self, client):
        # unknown fields are ignored, and definitely not forwarded
        resp = client.post("/api/searches",
                           json={"city": "austin", "places_key": "sneaky",
                                 "facebook_groups": ["123"]},
                           headers=auth())
        assert resp.status_code == 202


class TestLeads:
    def seed(self, client):
        client.post("/api/searches", json={"city": "austin"}, headers=auth())
        return client.get("/api/leads", headers=auth()).json()["leads"]

    def test_patch_round_trip(self, client):
        lead = self.seed(client)[0]
        resp = client.patch("/api/leads", headers=auth(), json={
            "key": lead["key"], "status": "won", "user_notes": "big yard",
            "next_action": "2026-08-20", "job_value": 450.0,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "won"
        assert body["user_notes"] == "big yard"
        assert body["job_value"] == 450.0

    def test_patch_unknown_key_404(self, client):
        resp = client.patch("/api/leads", headers=auth(), json={"key": "nope", "status": "called"})
        assert resp.status_code == 404

    def test_patch_bad_status_422(self, client):
        lead = self.seed(client)[0]
        resp = client.patch("/api/leads", headers=auth(),
                            json={"key": lead["key"], "status": "banana"})
        assert resp.status_code == 422

    def test_lead_json_contract(self, client):
        """Frozen key set: the page JS reads these fields; drift breaks silently."""
        lead = self.seed(client)[0]
        assert set(lead) == {
            "key", "source", "title", "url", "phone", "email", "address", "notes",
            "status", "user_notes", "next_action", "job_value", "called_at",
            "first_seen", "last_seen",
        }


class TestStatsAndExport:
    def test_stats_shape(self, client):
        client.post("/api/searches", json={"city": "austin"}, headers=auth())
        lead = client.get("/api/leads", headers=auth()).json()["leads"][0]
        client.patch("/api/leads", headers=auth(),
                     json={"key": lead["key"], "status": "won", "job_value": 300})
        stats = client.get("/api/stats", headers=auth()).json()
        assert stats["totals"]["won"] == 1
        assert stats["totals"]["revenue"] == 300
        assert any(s["win_rate"] == 1.0 for s in stats["sources"])

    def test_csv_export(self, client):
        client.post("/api/searches", json={"city": "austin"}, headers=auth())
        resp = client.get("/api/leads.csv", headers=auth())
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/csv")
        header = resp.text.splitlines()[0]
        assert header.startswith("source,title,url,phone")
        assert "status" in header and "job_value" in header
        assert len(resp.text.strip().splitlines()) == 3  # header + 2 leads
