"""Facebook group posts. Opt-in, and the least reliable source here.

Two things to know before enabling it:

* Automated collection from Facebook is against Meta's Terms of Service, and
  accounts used this way do get restricted. That risk lands on your account.
* `facebook_scraper` breaks whenever Meta changes its markup, which is often.
  Even with valid cookies a run can return zero posts through no fault of the
  configuration.

The manual alternative genuinely works: opening your local groups once a day
surfaces the same posts, and you can respond faster than a nightly job would.
"""

import logging

from ..extract import first_phone
from ..models import Lead, SourceResult

log = logging.getLogger(__name__)

DEFAULT_KEYWORDS = ("landscap", "lawn", "mowing", "mow", "yard", "garden", "sod", "mulch")


def _matches(text: str, keywords) -> bool:
    lowered = text.lower()
    return any(word in lowered for word in keywords)


def scrape(
    group_ids,
    cookies_file: str = "",
    pages: int = 5,
    keywords=DEFAULT_KEYWORDS,
    max_results: int = 100,
) -> SourceResult:
    result = SourceResult(name="Facebook")

    if not group_ids:
        result.error = "no group IDs provided"
        return result

    try:
        from facebook_scraper import get_posts, set_cookies  # optional dependency
    except ImportError:
        result.error = "facebook_scraper is not installed (pip install facebook-scraper)"
        return result

    if cookies_file:
        # Export these from a logged-in browser session with a cookies.txt
        # extension; without them Facebook serves a login wall to every request.
        try:
            set_cookies(cookies_file)
        except Exception as exc:
            result.error = f"could not load cookies from {cookies_file}: {exc}"
            return result
    else:
        log.warning("Facebook: no cookies file supplied — Facebook will almost certainly serve a login wall")

    errors = []
    for group_id in group_ids:
        try:
            for post in get_posts(group=group_id, pages=pages, options={"allow_extra_requests": False}):
                text = (post.get("text") or post.get("post_text") or "").strip()
                if not text or not _matches(text, keywords):
                    continue
                title = text[:80] + "..." if len(text) > 80 else text
                result.leads.append(
                    Lead(
                        source="Facebook",
                        title=" ".join(title.split()),
                        # post_url is already absolute; prefixing the domain
                        # again produced unusable links in earlier versions.
                        url=post.get("post_url") or f"https://www.facebook.com/groups/{group_id}",
                        phone=first_phone(text),
                        notes=f"group {group_id}",
                    )
                )
                if len(result.leads) >= max_results:
                    break
        except Exception as exc:
            errors.append(f"group {group_id}: {exc}")
        if len(result.leads) >= max_results:
            break

    if errors:
        if result.leads:
            result.warnings = errors
        else:
            result.error = "; ".join(errors) + " (expired cookies or a Meta markup change are the usual causes)"
    return result
