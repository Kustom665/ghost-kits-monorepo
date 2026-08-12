"""Text extraction and de-duplication helpers.

Kept free of network calls so they stay cheap to unit test.
"""

import re
from urllib.parse import urlsplit, urlunsplit

# North American numbers, with or without country code, in the shapes that
# actually show up in classified ads: 512-555-0134, (512) 555 0134,
# +1 512.555.0134, 5125550134.
PHONE_RE = re.compile(
    r"""
    (?<![\d-])
    (?:\+?1[\s.\-]?)?
    (?:\(\d{3}\)|\d{3})
    [\s.\-]?
    \d{3}
    [\s.\-]?
    \d{4}
    (?![\d-])
    """,
    re.VERBOSE,
)

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")

# Craigslist relay addresses are a dead end for outreach.
_EMAIL_BLOCKLIST = ("craigslist.org", "reply.craigslist", "example.com")


def normalize_phone(raw: str) -> str:
    """Return a `512-555-0134` style string, or "" if it isn't a usable number."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        return ""
    # Area codes and exchanges never start with 0 or 1; this filters out
    # dates, prices and zip+phone run-ons that match the loose regex.
    if digits[0] in "01" or digits[3] in "01":
        return ""
    return f"{digits[0:3]}-{digits[3:6]}-{digits[6:10]}"


def first_phone(text: str) -> str:
    for match in PHONE_RE.finditer(text or ""):
        phone = normalize_phone(match.group(0))
        if phone:
            return phone
    return ""


def first_email(text: str) -> str:
    for match in EMAIL_RE.finditer(text or ""):
        email = match.group(0).rstrip(".").lower()
        if not any(bad in email for bad in _EMAIL_BLOCKLIST):
            return email
    return ""


def canonical_url(url: str) -> str:
    """Strip scheme, query strings and trailing slashes so the same listing dedupes.

    The scheme is forced to https: sources link the same listing over both
    http and https, and those are not two leads.
    """
    if not url:
        return ""
    parts = urlsplit(url.strip())
    if not parts.netloc:
        return url.strip().lower()
    netloc = parts.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    path = parts.path.rstrip("/")
    return urlunsplit(("https", netloc, path, "", ""))


def dedupe_key(lead) -> str:
    """Prefer the URL; fall back to source+title for URL-less leads."""
    url = canonical_url(getattr(lead, "url", ""))
    if url:
        return url
    title = " ".join((getattr(lead, "title", "") or "").lower().split())
    return f"{getattr(lead, 'source', '')}::{title}"


def dedupe(leads, seen=None):
    """Return leads in original order with duplicates removed.

    `seen` is an optional mutable set of keys already claimed, so callers can
    dedupe a fresh run against an existing CSV.
    """
    seen = set() if seen is None else seen
    unique = []
    for lead in leads:
        key = dedupe_key(lead)
        if key in seen:
            continue
        seen.add(key)
        unique.append(lead)
    return unique
