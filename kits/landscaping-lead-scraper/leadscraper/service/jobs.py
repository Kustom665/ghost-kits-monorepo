"""Background scrape execution.

One worker thread, deliberately: it structurally enforces one-search-at-a-time
(the API's 409) and guarantees we never hit Craigslist from two jobs at once.

Honest limitation: cancellation and the deadline are only consulted between
sources — urllib3's retry sleeps aren't interruptible — so a cancel can take
up to ~70s to land. The real runtime bound is the cap on max_per_source.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor

from ..pipeline import run_search
from .config import JOB_MAX_SECONDS

log = logging.getLogger("leadscraper.service")


def _source_payload(results):
    return [
        {
            "name": r.name,
            "count": len(r.leads),
            "ok": r.ok,
            "error": r.error,
            "warnings": list(r.warnings),
        }
        for r in results
    ]


def _classify(outcome):
    """Decide a job's terminal status.

    A run where every source errored is a failure, not a successful search that
    happened to find nothing. Reporting it as "done" made a permanently broken
    scraper indistinguishable from a quiet week - which matters most on the
    scheduled path, where nobody is watching the UI. Sources skipped by
    configuration are not attempts and do not count either way.
    """
    if outcome.cancelled:
        return "cancelled", ""

    attempted = outcome.results
    if attempted and not any(r.ok for r in attempted):
        detail = "; ".join(f"{r.name}: {r.error}" for r in attempted if r.error)
        return "error", f"every source failed. {detail}"

    return "done", ""


def _log_outcome(job_id, status, error, outcome, new_count):
    """Leave a trail for headless runs.

    The scheduler logs that it submitted a job but nothing about how it went, so
    without this a nightly re-scrape that quietly stopped working reads exactly
    like one that simply found no new work.
    """
    if status == "error":
        log.warning("job %s failed: %s", job_id, error)
        return
    if status == "cancelled":
        log.info("job %s cancelled with %d leads so far", job_id, len(outcome.leads))
        return

    ok = sum(1 for r in outcome.results if r.ok)
    log.info(
        "job %s done: %d leads (%d new) from %d/%d sources",
        job_id, len(outcome.leads), new_count, ok, len(outcome.results),
    )
    for r in outcome.results:
        if not r.ok:
            log.warning("job %s: source %s failed - %s", job_id, r.name, r.error)


class JobRunner:
    def __init__(self, store, search=run_search, max_seconds: int = JOB_MAX_SECONDS):
        self.store = store
        self.search = search
        self.max_seconds = max_seconds
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="scrape")

    def submit(self, job_id: str, req):
        self._pool.submit(self._run, job_id, req)

    def _run(self, job_id: str, req):
        store = self.store
        store.mark_job_running(job_id)
        deadline = time.monotonic() + self.max_seconds
        results_so_far = []

        def should_cancel():
            return store.is_cancelled(job_id) or time.monotonic() > deadline

        def on_source(result):
            results_so_far.append(result)
            store.update_progress(
                job_id,
                phase=f"finished {result.name}",
                sources=_source_payload(results_so_far),
            )

        try:
            outcome = self.search(req, should_cancel=should_cancel, on_source=on_source)
            new_count = store.upsert_leads(outcome.leads, job_id=job_id)
            status, error = _classify(outcome)
            store.finish_job(
                job_id,
                status=status,
                error=error,
                sources=_source_payload(outcome.results),
                found=len(outcome.leads),
                new_count=new_count,
            )
            _log_outcome(job_id, status, error, outcome, new_count)
        except Exception as exc:  # a stuck 'running' job is the worst failure mode
            log.exception("job %s crashed", job_id)
            store.finish_job(
                job_id,
                status="error",
                error=str(exc),
                sources=_source_payload(results_so_far),
                found=0,
                new_count=0,
            )

    def shutdown(self, wait: bool = False):
        self._pool.shutdown(wait=wait, cancel_futures=True)
