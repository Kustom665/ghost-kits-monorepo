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
            store.finish_job(
                job_id,
                status="cancelled" if outcome.cancelled else "done",
                sources=_source_payload(outcome.results),
                found=len(outcome.leads),
                new_count=new_count,
            )
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
