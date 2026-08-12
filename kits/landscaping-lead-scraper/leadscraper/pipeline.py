"""Shared search orchestration used by both the CLI and the HTTP service.

This is the one place that knows the quirks of composing the sources:
Craigslist wants the normalized city ("sanantonio"), Google wants the raw one
("San Antonio"); the Facebook source takes neither a session nor a pause flag;
and de-duplication runs once, globally, after all sources.
"""

from dataclasses import dataclass, field

from .extract import dedupe
from .http import build_session
from .sources import craigslist, facebook_groups, google_places


def normalize_city(city: str) -> str:
    """Craigslist subdomains have no spaces or punctuation: 'San Antonio' -> 'sanantonio'."""
    return "".join(ch for ch in city.lower() if ch.isalnum())


@dataclass(frozen=True)
class SearchRequest:
    city: str
    state: str = ""
    keywords: str = craigslist.DEFAULT_KEYWORDS
    categories: tuple = craigslist.DEFAULT_CATEGORIES
    max_per_source: int = 100
    places_key: str = ""
    facebook_groups: tuple = ()
    facebook_cookies: str = ""
    facebook_pages: int = 5
    skip_craigslist: bool = False
    skip_google: bool = False
    pause: bool = True


@dataclass
class SearchOutcome:
    leads: list = field(default_factory=list)    # deduped, original order
    results: list = field(default_factory=list)  # SourceResult per source run
    skipped: list = field(default_factory=list)  # human-readable skip notes
    cancelled: bool = False


def run_search(req: SearchRequest, session=None, should_cancel=None, on_source=None) -> SearchOutcome:
    """Run every enabled source and return the combined, deduped outcome.

    `should_cancel` is consulted between sources (not mid-source); `on_source`
    fires after each source completes, for progress reporting.
    """
    session = session or build_session()
    should_cancel = should_cancel or (lambda: False)
    outcome = SearchOutcome()

    def finish(result):
        outcome.results.append(result)
        outcome.leads.extend(result.leads)
        if on_source:
            on_source(result)

    if req.skip_craigslist:
        outcome.skipped.append("Craigslist skipped (--skip-craigslist)")
    else:
        finish(
            craigslist.scrape(
                session,
                city=normalize_city(req.city),
                keywords=req.keywords,
                categories=list(req.categories),
                max_results=req.max_per_source,
                pause=req.pause,
            )
        )

    if should_cancel():
        outcome.cancelled = True
    elif req.skip_google:
        outcome.skipped.append("Google skipped (--skip-google)")
    else:
        finish(
            google_places.scrape(
                session,
                city=req.city,  # raw: this is a search query, not a subdomain
                state=req.state,
                api_key=req.places_key,
                max_results=req.max_per_source,
                pause=req.pause,
            )
        )

    if not outcome.cancelled and should_cancel():
        outcome.cancelled = True
    elif not outcome.cancelled:
        if req.facebook_groups:
            finish(
                facebook_groups.scrape(
                    group_ids=list(req.facebook_groups),
                    cookies_file=req.facebook_cookies,
                    pages=req.facebook_pages,
                    max_results=req.max_per_source,
                )
            )
        else:
            outcome.skipped.append("Facebook skipped (pass --facebook-group to enable)")

    outcome.leads = dedupe(outcome.leads)
    return outcome
