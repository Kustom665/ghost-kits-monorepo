from leadscraper.extract import dedupe
from leadscraper.models import Lead
from leadscraper.sources.facebook_groups import _matches, _post_url, scrape


class TestPostUrl:
    def test_prefers_post_url(self):
        post = {"post_url": "https://www.facebook.com/groups/123/posts/999"}
        assert _post_url(post, "123") == "https://www.facebook.com/groups/123/posts/999"

    def test_builds_from_post_id(self):
        assert _post_url({"post_id": "777"}, "123") == "https://www.facebook.com/groups/123/posts/777"

    def test_no_identifiers_means_empty_not_group_url(self):
        # A shared group-URL fallback would make dedupe collapse every post
        # from the group into one lead. Empty keys dedupe on source+title.
        assert _post_url({}, "123") == ""

    def test_urlless_posts_from_same_group_stay_distinct(self):
        leads = [
            Lead(source="Facebook", title="need my yard mowed", url=_post_url({}, "123")),
            Lead(source="Facebook", title="looking for landscaper", url=_post_url({}, "123")),
        ]
        assert len(dedupe(leads)) == 2


class TestScrapeErrorPaths:
    def test_no_group_ids_is_an_error(self):
        result = scrape(group_ids=[])
        assert not result.ok
        assert "no group IDs" in result.error


class TestMatches:
    def test_keyword_matching_is_case_insensitive(self):
        assert _matches("Need my LAWN mowed", ("lawn",))
        assert not _matches("selling a couch", ("lawn", "yard"))
