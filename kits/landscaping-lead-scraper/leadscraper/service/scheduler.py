"""Optional periodic re-scrape: `--every N` hours on the serve command.

The tick logic is a pure function so it can be tested with a fake clock;
the thread is a thin loop around it.
"""

import logging
import threading

log = logging.getLogger("leadscraper.service")


def next_run(last_run: float, every_seconds: float, now: float) -> float:
    """Earliest allowed next run. Anchored to last_run to avoid drift."""
    if last_run <= 0:
        return now
    return last_run + every_seconds


def should_fire(last_run: float, every_seconds: float, now: float, busy: bool) -> bool:
    """Fire when the interval has elapsed and no job is already running.

    A busy tick is skipped, not queued — the next interval catches up.
    """
    return not busy and now >= next_run(last_run, every_seconds, now)


class Scheduler:
    def __init__(self, store, runner, make_request, every_hours: float,
                 clock=None, poll_seconds: float = 30.0):
        import time as _time

        self.store = store
        self.runner = runner
        self.make_request = make_request  # () -> SearchRequest
        self.every_seconds = every_hours * 3600
        self.clock = clock or _time.monotonic
        self.poll_seconds = poll_seconds
        self.last_run = 0.0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="rescrape")

    def start(self):
        self._thread.start()

    def stop(self):
        self._stop.set()

    def tick(self) -> bool:
        """One scheduling decision. Returns True if a job was submitted."""
        now = self.clock()
        busy = self.store.running_job_id() is not None
        if not should_fire(self.last_run, self.every_seconds, now, busy):
            return False
        req = self.make_request()
        job_id = self.store.create_job({"scheduled": True, "city": req.city, "state": req.state})
        self.runner.submit(job_id, req)
        self.last_run = now
        log.info("scheduled re-scrape submitted as job %s", job_id)
        return True

    def _loop(self):
        # First run happens one poll after startup, not at hour N.
        while not self._stop.wait(self.poll_seconds):
            try:
                self.tick()
            except Exception:
                log.exception("scheduler tick failed")
