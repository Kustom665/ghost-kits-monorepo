from leadscraper.extract import (
    canonical_url,
    dedupe,
    first_email,
    first_phone,
    normalize_phone,
)
from leadscraper.models import Lead


class TestPhones:
    def test_common_formats(self):
        assert first_phone("call 512-555-0134 today") == "512-555-0134"
        assert first_phone("(512) 555 0134") == "512-555-0134"
        assert first_phone("+1 512.555.0134") == "512-555-0134"
        assert first_phone("text 5125550134 anytime") == "512-555-0134"

    def test_rejects_non_numbers(self):
        # Area codes never start with 0 or 1, which rules out most false hits.
        assert normalize_phone("111-555-0134") == ""
        assert normalize_phone("512-055-0134") == ""
        assert first_phone("mowing 20x30 lot, $150") == ""
        assert first_phone("no digits here") == ""

    def test_returns_first_valid_match(self):
        assert first_phone("ref 000-000-0000 then 737-555-0199") == "737-555-0199"


class TestEmails:
    def test_finds_email(self):
        assert first_email("reach me at Jane.Doe+lawn@Example.NET.") == "jane.doe+lawn@example.net"

    def test_skips_craigslist_relay(self):
        text = "reply to abc123@sale.craigslist.org or jane@realmail.com"
        assert first_email(text) == "jane@realmail.com"


class TestCanonicalUrl:
    def test_strips_query_and_trailing_slash(self):
        a = canonical_url("https://WWW.Example.com/listing/123/?utm_source=x")
        b = canonical_url("http://example.com/listing/123")
        assert a == b == "https://example.com/listing/123"

    def test_empty_stays_empty(self):
        assert canonical_url("") == ""


class TestDedupe:
    def test_same_listing_collapses(self):
        leads = [
            Lead(source="Craigslist", title="Need mowing", url="https://austin.craigslist.org/wan/1.html"),
            Lead(source="Craigslist", title="Need mowing", url="https://austin.craigslist.org/wan/1.html?x=1"),
        ]
        assert len(dedupe(leads)) == 1

    def test_urlless_leads_dedupe_on_title(self):
        leads = [
            Lead(source="Facebook", title="Looking  for a landscaper"),
            Lead(source="Facebook", title="looking for a LANDSCAPER"),
            Lead(source="Facebook", title="different post"),
        ]
        assert len(dedupe(leads)) == 2

    def test_respects_preexisting_keys(self):
        seen = {"https://example.com/a"}
        leads = [Lead(source="Google", title="A", url="https://example.com/a/")]
        assert dedupe(leads, seen=seen) == []

    def test_preserves_order(self):
        leads = [
            Lead(source="Google", title="first", url="https://a.com"),
            Lead(source="Google", title="second", url="https://b.com"),
        ]
        assert [lead.title for lead in dedupe(leads)] == ["first", "second"]
