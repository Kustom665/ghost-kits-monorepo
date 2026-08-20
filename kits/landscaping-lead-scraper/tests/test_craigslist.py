import pytest

from leadscraper.sources import craigslist

FEED = """<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <item rdf:about="https://austin.craigslist.org/wan/d/needed/1.html">
    <title>Need lawn mowing every 2 weeks</title>
    <link>https://austin.craigslist.org/wan/d/needed/1.html</link>
    <description>&lt;p&gt;Quarter acre in south Austin. Call 512-555-0134 or
      email jane@realmail.com&lt;/p&gt;</description>
    <dc:date>2026-08-11T09:14:22-05:00</dc:date>
  </item>
  <item rdf:about="https://austin.craigslist.org/wan/d/needed/2.html">
    <title>Looking for yard cleanup help</title>
    <link>https://austin.craigslist.org/wan/d/needed/2.html</link>
    <description>&lt;p&gt;Reply through craigslist please.&lt;/p&gt;</description>
  </item>
</rdf:RDF>
"""


class TestParseFeed:
    def test_extracts_both_items(self):
        leads = craigslist._parse_feed(FEED)
        assert len(leads) == 2
        assert leads[0].title == "Need lawn mowing every 2 weeks"
        assert leads[0].url == "https://austin.craigslist.org/wan/d/needed/1.html"
        assert leads[0].source == "Craigslist"

    def test_pulls_contact_details_out_of_the_body(self):
        lead = craigslist._parse_feed(FEED)[0]
        assert lead.phone == "512-555-0134"
        assert lead.email == "jane@realmail.com"

    def test_description_html_is_stripped(self):
        lead = craigslist._parse_feed(FEED)[0]
        assert "<p>" not in lead.notes
        assert "Quarter acre in south Austin." in lead.notes

    def test_notes_stay_on_one_line(self):
        # The feed body wraps across lines; a newline in the CSV breaks grep.
        lead = craigslist._parse_feed(FEED)[0]
        assert "\n" not in lead.notes
        assert "  " not in lead.notes

    def test_missing_contact_details_are_empty_not_na(self):
        lead = craigslist._parse_feed(FEED)[1]
        assert lead.phone == ""
        assert lead.email == ""

    def test_empty_feed_yields_nothing(self):
        empty = '<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"></rdf:RDF>'
        assert craigslist._parse_feed(empty) == []

    def test_malformed_xml_raises(self):
        import xml.etree.ElementTree as ET

        with pytest.raises(ET.ParseError):
            craigslist._parse_feed("<rdf:RDF><unclosed>")


class FakeResponse:
    def __init__(self, text="", status_code=200, url="https://example.com"):
        self.text = text
        self.status_code = status_code
        self.url = url


class FakeSession:
    """Records calls and replays a queued list of responses."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        return self.responses.pop(0) if self.responses else FakeResponse(status_code=404)


class TestScrape:
    def test_requests_the_rss_feed_not_the_html_page(self):
        session = FakeSession([FakeResponse(FEED)])
        craigslist.scrape(session, city="austin", max_results=25, pause=False)
        url, params = session.calls[0]
        assert url == "https://austin.craigslist.org/search/wan"
        assert params["format"] == "rss"

    def test_stops_on_a_short_page(self):
        # 2 items is fewer than PAGE_SIZE, so there is no second request.
        session = FakeSession([FakeResponse(FEED)])
        result = craigslist.scrape(session, city="austin", max_results=100, pause=False)
        assert len(session.calls) == 1
        assert len(result.leads) == 2
        assert result.ok

    def test_http_error_is_reported_not_raised(self):
        session = FakeSession([FakeResponse("", status_code=403)])
        result = craigslist.scrape(session, city="austin", pause=False)
        assert result.leads == []
        assert "403" in result.error

    def test_network_exception_is_captured(self):
        class Exploding:
            def get(self, *a, **kw):
                raise ConnectionError("dns failure")

        result = craigslist.scrape(Exploding(), city="austin", pause=False)
        assert "dns failure" in result.error

    def test_respects_max_results(self):
        session = FakeSession([FakeResponse(FEED), FakeResponse(FEED)])
        result = craigslist.scrape(session, city="austin", max_results=1, pause=False)
        assert len(result.leads) == 1

    def test_sweeps_each_category(self):
        session = FakeSession([FakeResponse(FEED), FakeResponse(FEED)])
        craigslist.scrape(session, city="austin", categories=["wan", "hss"], pause=False)
        assert [call[0].rsplit("/", 1)[-1] for call in session.calls] == ["wan", "hss"]

    def test_partial_failure_becomes_warning_not_silence(self):
        # One dead board plus one good board: previously the 404 vanished.
        session = FakeSession([FakeResponse("", status_code=404), FakeResponse(FEED)])
        result = craigslist.scrape(session, city="austin", categories=["hss", "wan"], pause=False)
        assert result.ok is True
        assert len(result.leads) == 2
        assert len(result.warnings) == 1
        assert "hss" in result.warnings[0]
