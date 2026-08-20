"""Terminal-status classification and outcome logging for scrape jobs.

The scheduled path runs headless, so a job that fails has to say so in its
status and in the log — not just bury the reason in the per-source array.
"""

import logging

from leadscraper.models import Lead, SourceResult
from leadscraper.pipeline import SearchOutcome
from leadscraper.service.jobs import _classify, _log_outcome


def ok_source(name="Craigslist", count=1):
    leads = [Lead(source=name, title=f"lead {i}", url=f"https://x/{name}/{i}")
             for i in range(count)]
    return SourceResult(name=name, leads=leads)


def failed_source(name="Craigslist", error="boom"):
    # ok is derived: a source is ok exactly when it has no error.
    return SourceResult(name=name, leads=[], error=error)


class TestClassify:
    def test_all_sources_ok_is_done(self):
        outcome = SearchOutcome(leads=[Lead(source="c", title="t")],
                                results=[ok_source(), ok_source("Google Places")])
        assert _classify(outcome) == ("done", "")

    def test_every_source_failed_is_an_error_not_a_quiet_success(self):
        outcome = SearchOutcome(results=[
            failed_source("Craigslist", "403 Forbidden"),
            failed_source("Google Places", "no API key"),
        ])
        status, error = _classify(outcome)
        assert status == "error"
        assert "403 Forbidden" in error and "no API key" in error

    def test_partial_failure_still_counts_as_done(self):
        # One source working is a real result; do not cry wolf.
        outcome = SearchOutcome(leads=[Lead(source="c", title="t")],
                                results=[ok_source(), failed_source("Google Places")])
        assert _classify(outcome)[0] == "done"

    def test_no_sources_attempted_is_not_a_failure(self):
        # Everything skipped by configuration (--skip-craigslist --skip-google).
        assert _classify(SearchOutcome(results=[], skipped=["all skipped"])) == ("done", "")

    def test_cancelled_wins_over_source_failures(self):
        outcome = SearchOutcome(results=[failed_source()], cancelled=True)
        assert _classify(outcome) == ("cancelled", "")

    def test_zero_leads_from_a_working_source_is_still_done(self):
        # A genuinely quiet week must not be reported as a failure.
        outcome = SearchOutcome(results=[ok_source(count=0)])
        assert _classify(outcome) == ("done", "")


class TestLogOutcome:
    def test_total_failure_logs_a_warning(self, caplog):
        outcome = SearchOutcome(results=[failed_source("Craigslist", "403")])
        status, error = _classify(outcome)
        with caplog.at_level(logging.WARNING, logger="leadscraper.service"):
            _log_outcome("job1", status, error, outcome, 0)
        assert any(r.levelno == logging.WARNING and "403" in r.getMessage()
                   for r in caplog.records)

    def test_partial_failure_logs_the_broken_source_even_when_done(self, caplog):
        outcome = SearchOutcome(leads=[Lead(source="c", title="t")],
                                results=[ok_source(), failed_source("Google Places", "no key")])
        status, error = _classify(outcome)
        with caplog.at_level(logging.INFO, logger="leadscraper.service"):
            _log_outcome("job2", status, error, outcome, 1)
        messages = [r.getMessage() for r in caplog.records]
        assert any("done" in m for m in messages)
        assert any("Google Places" in m and "no key" in m for m in messages)

    def test_success_records_counts(self, caplog):
        outcome = SearchOutcome(leads=[Lead(source="c", title="t")], results=[ok_source()])
        with caplog.at_level(logging.INFO, logger="leadscraper.service"):
            _log_outcome("job3", "done", "", outcome, 1)
        assert any("job3" in r.getMessage() for r in caplog.records)
