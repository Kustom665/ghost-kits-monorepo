"""Network fakes shared by pipeline/API tests.

Extends the pattern from test_craigslist.py with POST support and .json(),
which google_places needs. test_craigslist.py keeps its own local copies.
"""

import json


class FakeResponse:
    def __init__(self, text="", status_code=200, url="https://example.com", json_data=None):
        self._json = json_data
        self.text = text if text else (json.dumps(json_data) if json_data is not None else "")
        self.status_code = status_code
        self.url = url

    def json(self):
        if self._json is None:
            return json.loads(self.text)
        return self._json


class FakeSession:
    """Replays queued responses; records every call as (method, url, kwargs)."""

    def __init__(self, responses=()):
        self.responses = list(responses)
        self.calls = []

    def _next(self):
        return self.responses.pop(0) if self.responses else FakeResponse(status_code=404)

    def get(self, url, params=None, timeout=None):
        self.calls.append(("GET", url, {"params": params}))
        return self._next()

    def post(self, url, json=None, headers=None, timeout=None):
        self.calls.append(("POST", url, {"json": json, "headers": headers}))
        return self._next()


CRAIGSLIST_FEED = """<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/">
  <item rdf:about="https://example.craigslist.org/wan/d/1.html">
    <title>Need lawn mowing every 2 weeks</title>
    <link>https://example.craigslist.org/wan/d/1.html</link>
    <description>Call 512-555-0134</description>
  </item>
</rdf:RDF>
"""

PLACES_PAGE = {
    "places": [
        {
            "id": "abc123",
            "displayName": {"text": "Hill Country Property Mgmt"},
            "formattedAddress": "100 Congress Ave, Austin, TX",
            "nationalPhoneNumber": "(512) 555-0188",
            "websiteUri": "https://hcpm.example.com",
        }
    ]
}
