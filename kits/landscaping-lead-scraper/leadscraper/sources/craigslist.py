"""Craigslist source, via the RSS feed rather than the HTML page.

Craigslist search results are rendered client-side, so `requests` + BeautifulSoup
against `/search/wan` returns an empty shell — the `li.result-row` /
`a.result-title` selectors have not matched since the 2021 redesign. The RSS
feed for the same query is still server-rendered and stable, so that is what
this source reads.
"""

import logging
import xml.etree.ElementTree as ET

from bs4 import BeautifulSoup

from ..extract import first_email, first_phone
from ..http import DEFAULT_TIMEOUT, polite_pause
from ..models import Lead, SourceResult

log = logging.getLogger(__name__)

RSS_NS = "{http://purl.org/rss/1.0/}"
PAGE_SIZE = 25  # Craigslist returns 25 items per RSS page.

# "wanted" is where people post asking for a service; the household/labor
# service boards are worth sweeping too since competitors and subcontract
# requests both surface there.
DEFAULT_CATEGORIES = ("wan",)
DEFAULT_KEYWORDS = "landscaping OR lawn OR mowing OR yard"


def _text(item, tag: str) -> str:
    node = item.find(f"{RSS_NS}{tag}")
    return (node.text or "").strip() if node is not None else ""


def _strip_html(raw: str) -> str:
    """Plain text on a single line — embedded newlines make the CSV hard to grep."""
    if not raw:
        return ""
    text = BeautifulSoup(raw, "html.parser").get_text(" ", strip=True)
    return " ".join(text.split())


def _parse_feed(xml_text: str):
    """Parse one RSS page into Leads. Raises ET.ParseError on malformed XML."""
    root = ET.fromstring(xml_text)
    leads = []
    for item in root.iter(f"{RSS_NS}item"):
        title = _text(item, "title")
        link = _text(item, "link")
        if not title and not link:
            continue
        body = _strip_html(_text(item, "description"))
        leads.append(
            Lead(
                source="Craigslist",
                title=title,
                url=link,
                # Craigslist masks contact info behind its reply form, but
                # posters routinely paste a number into the body anyway.
                phone=first_phone(f"{title} {body}"),
                email=first_email(body),
                notes=body[:300],
            )
        )
    return leads


def scrape(
    session,
    city: str,
    keywords: str = DEFAULT_KEYWORDS,
    categories=DEFAULT_CATEGORIES,
    max_results: int = 100,
    pause: bool = True,
) -> SourceResult:
    result = SourceResult(name="Craigslist")
    errors = []

    for category in categories:
        base_url = f"https://{city}.craigslist.org/search/{category}"
        for offset in range(0, max(max_results, 1), PAGE_SIZE):
            params = {"query": keywords, "sort": "date", "format": "rss", "s": offset}
            try:
                resp = session.get(base_url, params=params, timeout=DEFAULT_TIMEOUT)
            except Exception as exc:  # network-level failure
                errors.append(f"{category}: {exc}")
                break

            if resp.status_code == 404:
                errors.append(f"{category}: no such city/category board ({resp.url})")
                break
            if resp.status_code != 200:
                errors.append(f"{category}: HTTP {resp.status_code}")
                break

            try:
                page_leads = _parse_feed(resp.text)
            except ET.ParseError as exc:
                errors.append(f"{category}: unparseable feed ({exc})")
                break

            if not page_leads:
                break

            result.leads.extend(page_leads)
            log.debug("craigslist %s offset=%s -> %d items", category, offset, len(page_leads))

            if len(page_leads) < PAGE_SIZE or len(result.leads) >= max_results:
                break
            if pause:
                polite_pause()

    result.leads = result.leads[:max_results]
    if errors and not result.leads:
        result.error = "; ".join(errors)
    return result
