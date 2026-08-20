"""Property managers and HOAs, via the Google Places API.

The original approach — the `googlesearch` package scraping the results page —
gets throttled to HTTP 429 within a few queries and can only ever return a bare
URL. Places Text Search returns the business name, address and phone number in
one call, which is the column the outreach sheet actually needs. Set
GOOGLE_PLACES_API_KEY to use it.

`search_fallback` keeps the scraped-search behaviour available for runs with no
API key, with its limitations stated plainly rather than silently returning
"N/A" phone numbers.
"""

import logging
import os

from ..extract import first_phone
from ..http import DEFAULT_TIMEOUT, polite_pause
from ..models import Lead, SourceResult

log = logging.getLogger(__name__)

PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.websiteUri",
        "nextPageToken",
    ]
)

# Sites that are directories rather than a business you can call.
_SKIP_DOMAINS = ("yellowpages.", "yelp.", "facebook.", "linkedin.", "indeed.", "bbb.org")


def default_queries(city: str, state: str):
    where = f"{city} {state}".strip()
    return [
        f"property management companies in {where}",
        f"homeowners association management in {where}",
        f"apartment complexes in {where}",
        f"commercial property management in {where}",
    ]


def _places_page(session, api_key: str, query: str, page_token: str = ""):
    payload = {"textQuery": query}
    if page_token:
        payload["pageToken"] = page_token
    resp = session.post(
        PLACES_ENDPOINT,
        json=payload,
        headers={"X-Goog-Api-Key": api_key, "X-Goog-FieldMask": FIELD_MASK},
        timeout=DEFAULT_TIMEOUT,
    )
    if resp.status_code != 200:
        detail = ""
        try:
            detail = resp.json().get("error", {}).get("message", "")
        except ValueError:
            detail = resp.text[:200]
        raise RuntimeError(f"Places API HTTP {resp.status_code}: {detail}")
    return resp.json()


def scrape(
    session,
    city: str,
    state: str,
    queries=None,
    api_key: str = "",
    max_results: int = 60,
    pause: bool = True,
) -> SourceResult:
    result = SourceResult(name="Google Places")
    api_key = api_key or os.environ.get("GOOGLE_PLACES_API_KEY", "")
    queries = queries or default_queries(city, state)

    if not api_key:
        return search_fallback(city, state, queries=queries, max_results=max_results, pause=pause)

    errors = []
    for query in queries:
        page_token = ""
        while len(result.leads) < max_results:
            try:
                data = _places_page(session, api_key, query, page_token)
            except Exception as exc:
                errors.append(f"{query}: {exc}")
                break

            places = data.get("places", []) or []
            for place in places:
                name = (place.get("displayName") or {}).get("text", "").strip()
                website = place.get("websiteUri", "") or ""
                if any(domain in website for domain in _SKIP_DOMAINS):
                    continue
                result.leads.append(
                    Lead(
                        source="Google Places",
                        title=name or "(unnamed listing)",
                        url=website or f"https://www.google.com/maps/place/?q=place_id:{place.get('id','')}",
                        phone=place.get("nationalPhoneNumber", "") or "",
                        address=place.get("formattedAddress", "") or "",
                        notes=f"matched query: {query}",
                    )
                )

            page_token = data.get("nextPageToken", "")
            if not page_token:
                break
            if pause:
                polite_pause(1.0, 2.0)

    result.leads = result.leads[:max_results]
    if errors:
        if result.leads:
            result.warnings = errors
        else:
            result.error = "; ".join(errors)
    return result


def search_fallback(city: str, state: str, queries=None, max_results: int = 45, pause: bool = True) -> SourceResult:
    """No-API-key path: organic search results only, no phone numbers.

    Depends on the optional `googlesearch-python` package and is rate-limited
    aggressively by Google; treat anything it returns as a list of companies to
    look up by hand.
    """
    result = SourceResult(name="Google Search (fallback)")
    queries = queries or default_queries(city, state)

    try:
        from googlesearch import search  # optional dependency
    except ImportError:
        result.error = (
            "no GOOGLE_PLACES_API_KEY set and googlesearch-python is not installed "
            "(pip install googlesearch-python, or set the API key for phone numbers)"
        )
        return result

    errors = []
    for query in queries:
        try:
            for url in search(query, num_results=15, lang="en"):
                if any(domain in url for domain in _SKIP_DOMAINS):
                    continue
                result.leads.append(
                    Lead(
                        source="Google Search",
                        title=f"Lookup required — result for: {query}",
                        url=url,
                        phone=first_phone(url),  # almost always empty; phone needs a site visit
                        notes="organic search hit; no phone available without the Places API",
                    )
                )
                if len(result.leads) >= max_results:
                    break
        except Exception as exc:
            errors.append(f"{query}: {exc}")
        if len(result.leads) >= max_results:
            break
        if pause:
            polite_pause(1.0, 2.0)

    if errors:
        if result.leads:
            result.warnings = errors
        else:
            result.error = "; ".join(errors)
    return result
