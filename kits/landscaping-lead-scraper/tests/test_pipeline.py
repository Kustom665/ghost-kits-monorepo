from leadscraper.pipeline import SearchRequest, SearchOutcome, normalize_city, run_search

from .fakes import CRAIGSLIST_FEED, PLACES_PAGE, FakeResponse, FakeSession


def make_request(**overrides):
    defaults = dict(city="San Antonio", state="texas", pause=False, places_key="test-key")
    defaults.update(overrides)
    return SearchRequest(**defaults)


class TestCitySplit:
    def test_craigslist_normalized_google_raw(self):
        session = FakeSession([FakeResponse(CRAIGSLIST_FEED), FakeResponse(json_data=PLACES_PAGE)])
        run_search(make_request(), session=session)

        get_calls = [c for c in session.calls if c[0] == "GET"]
        post_calls = [c for c in session.calls if c[0] == "POST"]
        assert "sanantonio.craigslist.org" in get_calls[0][1]
        # Google Places is a text query, so the raw city with its space survives.
        assert "San Antonio" in post_calls[0][2]["json"]["textQuery"]


class TestSkips:
    def test_skips_populate_notes_and_omit_results(self):
        outcome = run_search(
            make_request(skip_craigslist=True, skip_google=True),
            session=FakeSession(),
        )
        assert outcome.results == []
        assert any("Craigslist" in s for s in outcome.skipped)
        assert any("Google" in s for s in outcome.skipped)
        assert any("Facebook" in s for s in outcome.skipped)

    def test_enabled_sources_do_not_appear_in_skipped(self):
        session = FakeSession([FakeResponse(CRAIGSLIST_FEED), FakeResponse(json_data=PLACES_PAGE)])
        outcome = run_search(make_request(), session=session)
        assert len(outcome.results) == 2
        assert outcome.skipped == ["Facebook skipped (pass --facebook-group to enable)"]


class TestDedupeAcrossSources:
    def test_same_url_from_two_sources_collapses(self):
        shared_url = "https://hcpm.example.com"
        feed = CRAIGSLIST_FEED.replace(
            "https://example.craigslist.org/wan/d/1.html", shared_url
        )
        session = FakeSession([FakeResponse(feed), FakeResponse(json_data=PLACES_PAGE)])
        outcome = run_search(make_request(), session=session)
        assert sum(1 for lead in outcome.leads if lead.url == shared_url) == 1


class TestCancellation:
    def test_cancel_after_first_source_stops_run(self):
        # Cancellation is only consulted between sources, so Craigslist
        # completes even with an always-true predicate; Google never starts.
        session = FakeSession([FakeResponse(CRAIGSLIST_FEED)])
        outcome = run_search(make_request(), session=session, should_cancel=lambda: True)

        assert outcome.cancelled is True
        assert [r.name for r in outcome.results] == ["Craigslist"]
        assert not any(c[0] == "POST" for c in session.calls)

    def test_no_cancel_runs_everything(self):
        session = FakeSession([FakeResponse(CRAIGSLIST_FEED), FakeResponse(json_data=PLACES_PAGE)])
        outcome = run_search(make_request(), session=session)
        assert outcome.cancelled is False
        assert [r.name for r in outcome.results] == ["Craigslist", "Google Places"]


class TestProgressHook:
    def test_on_source_fires_in_order(self):
        seen = []
        session = FakeSession([FakeResponse(CRAIGSLIST_FEED), FakeResponse(json_data=PLACES_PAGE)])
        run_search(make_request(), session=session, on_source=lambda r: seen.append(r.name))
        assert seen == ["Craigslist", "Google Places"]


class TestNormalizeCityReexport:
    def test_cli_still_exports_normalize_city(self):
        from leadscraper.cli import normalize_city as from_cli

        assert from_cli is normalize_city
