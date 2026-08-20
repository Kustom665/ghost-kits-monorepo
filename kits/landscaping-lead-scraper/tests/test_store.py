import pytest

from leadscraper.models import Lead
from leadscraper.service.store import Store


@pytest.fixture
def store(tmp_path):
    return Store(str(tmp_path / "leads.db"))


def make_lead(**overrides):
    defaults = dict(
        source="Craigslist",
        title="Need mowing",
        url="https://example.craigslist.org/wan/d/1.html",
        phone="512-555-0134",
    )
    defaults.update(overrides)
    return Lead(**defaults)


class TestUpsert:
    def test_new_leads_counted(self, store):
        n = store.upsert_leads([make_lead(), make_lead(url="https://other.com/x")])
        assert n == 2
        assert store.upsert_leads([make_lead()]) == 0  # same key again

    def test_rescrape_refreshes_fields_but_never_call_state(self, store):
        """THE invariant: a re-scrape must not clobber work done on a lead."""
        store.upsert_leads([make_lead()], job_id="job1")
        key = store.list_leads()[1][0]["key"]

        store.update_lead(key, status="called", user_notes="quoted $80",
                          next_action="2026-08-20", job_value=80)

        store.upsert_leads([make_lead(title="UPDATED title", phone="512-555-9999")], job_id="job2")

        row = store.get_lead(key)
        assert row["title"] == "UPDATED title"          # scraped field refreshed
        assert row["phone"] == "512-555-9999"
        assert row["last_job"] == "job2"
        assert row["status"] == "called"                # call state untouched
        assert row["user_notes"] == "quoted $80"
        assert row["next_action"] == "2026-08-20"
        assert row["job_value"] == 80
        assert row["called_at"] is not None
        assert row["first_seen"] is not None

    def test_leads_without_keys_are_skipped(self, store):
        assert store.upsert_leads([Lead(source="X", title="")]) == 1  # title-keyed still works


class TestUpdateLead:
    def test_unknown_key_returns_none(self, store):
        assert store.update_lead("nope", status="called") is None

    def test_bad_status_raises(self, store):
        store.upsert_leads([make_lead()])
        key = store.list_leads()[1][0]["key"]
        with pytest.raises(ValueError):
            store.update_lead(key, status="banana")

    def test_called_stamps_called_at(self, store):
        store.upsert_leads([make_lead()])
        key = store.list_leads()[1][0]["key"]
        row = store.update_lead(key, status="called")
        assert row["called_at"]

    def test_empty_next_action_clears_date(self, store):
        store.upsert_leads([make_lead()])
        key = store.list_leads()[1][0]["key"]
        store.update_lead(key, next_action="2026-08-20")
        row = store.update_lead(key, next_action="")
        assert row["next_action"] is None


class TestOrdering:
    def test_due_follow_ups_sort_first_then_new_with_phone(self, store):
        store.upsert_leads([
            make_lead(url="https://a.com/1", title="no phone new", phone=""),
            make_lead(url="https://a.com/2", title="has phone new"),
            make_lead(url="https://a.com/3", title="due follow up"),
        ])
        _, rows = store.list_leads()
        key3 = next(r["key"] for r in rows if r["title"] == "due follow up")
        store.update_lead(key3, status="follow_up", next_action="2020-01-01")  # overdue

        _, rows = store.list_leads()
        assert rows[0]["title"] == "due follow up"
        assert rows[1]["title"] == "has phone new"
        assert rows[2]["title"] == "no phone new"

    def test_filters(self, store):
        store.upsert_leads([
            make_lead(url="https://a.com/1"),
            make_lead(url="https://a.com/2", phone=""),
        ])
        total, rows = store.list_leads(has_phone=True)
        assert total == 1 and rows[0]["phone"]
        key = rows[0]["key"]
        store.update_lead(key, status="won")
        total, rows = store.list_leads(status="won")
        assert total == 1


class TestStats:
    def test_funnel_math(self, store):
        store.upsert_leads([
            make_lead(url="https://a.com/1"),
            make_lead(url="https://a.com/2"),
            make_lead(url="https://a.com/3"),
            make_lead(url="https://b.com/1", source="Google Places"),
        ])
        _, rows = store.list_leads()
        keys = {r["url"]: r["key"] for r in rows}
        store.update_lead(keys["https://a.com/1"], status="won", job_value=300)
        store.update_lead(keys["https://a.com/2"], status="lost")
        # a.com/3 stays new; b.com/1 stays new

        stats = store.stats()
        cl = next(s for s in stats["sources"] if s["source"] == "Craigslist")
        assert cl["leads"] == 3
        assert cl["contacted"] == 2
        assert cl["won"] == 1
        assert cl["win_rate"] == 0.5
        assert cl["revenue"] == 300

        gp = next(s for s in stats["sources"] if s["source"] == "Google Places")
        assert gp["contacted"] == 0
        assert gp["win_rate"] is None

        assert stats["totals"]["revenue"] == 300
        assert stats["totals"]["leads"] == 4


class TestJobs:
    def test_lifecycle(self, store):
        job_id = store.create_job({"city": "austin"})
        assert store.running_job_id() == job_id
        store.mark_job_running(job_id)
        store.update_progress(job_id, phase="finished Craigslist",
                              sources=[{"name": "Craigslist", "count": 3}])
        job = store.get_job(job_id)
        assert job["status"] == "running"
        assert job["sources"][0]["count"] == 3

        store.finish_job(job_id, status="done", sources=[], found=3, new_count=2)
        job = store.get_job(job_id)
        assert job["status"] == "done" and job["new_count"] == 2
        assert store.running_job_id() is None

    def test_cancel_flag(self, store):
        job_id = store.create_job({})
        assert store.is_cancelled(job_id) is False
        assert store.request_cancel(job_id) is True
        assert store.is_cancelled(job_id) is True
        store.finish_job(job_id, status="cancelled", sources=[], found=0, new_count=0)
        assert store.request_cancel(job_id) is False  # already finished

    def test_fail_orphaned_jobs(self, store):
        job_id = store.create_job({})
        store.mark_job_running(job_id)
        assert store.fail_orphaned_jobs() == 1
        assert store.get_job(job_id)["status"] == "error"
        assert store.running_job_id() is None
