from leadscraper.service.scheduler import next_run, should_fire


class TestNextRun:
    def test_never_ran_fires_now(self):
        assert next_run(0, 3600, now=1000) == 1000

    def test_anchored_to_last_run(self):
        assert next_run(last_run=1000, every_seconds=3600, now=5000) == 4600


class TestShouldFire:
    def test_fires_when_interval_elapsed_and_idle(self):
        assert should_fire(last_run=0, every_seconds=3600, now=10, busy=False) is True

    def test_skips_when_busy(self):
        assert should_fire(last_run=0, every_seconds=3600, now=10, busy=True) is False

    def test_waits_for_interval(self):
        assert should_fire(last_run=100, every_seconds=3600, now=200, busy=False) is False
        assert should_fire(last_run=100, every_seconds=3600, now=3701, busy=False) is True
