"""Command line entry point.

    python -m leadscraper --city austin --state texas
"""

import argparse
import logging
import sys

from .export import write_csv
from .extract import dedupe
from .http import build_session
from .sources import craigslist, facebook_groups, google_places

log = logging.getLogger("leadscraper")


def normalize_city(city: str) -> str:
    """Craigslist subdomains have no spaces or punctuation: 'San Antonio' -> 'sanantonio'."""
    return "".join(ch for ch in city.lower() if ch.isalnum())


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="leadscraper",
        description="Collect landscaping leads from Craigslist, Google Places and Facebook groups.",
    )
    parser.add_argument("--city", required=True, help="City name, e.g. austin")
    parser.add_argument("--state", default="", help="State name or abbreviation, e.g. texas")
    parser.add_argument(
        "--keywords",
        default=craigslist.DEFAULT_KEYWORDS,
        help="Craigslist search terms (default: %(default)s)",
    )
    parser.add_argument(
        "--categories",
        default=",".join(craigslist.DEFAULT_CATEGORIES),
        help="Comma-separated Craigslist boards, e.g. wan,hss (default: %(default)s)",
    )
    parser.add_argument("--max-per-source", type=int, default=100, help="Cap on leads per source")
    parser.add_argument("--places-key", default="", help="Google Places API key (else $GOOGLE_PLACES_API_KEY)")
    parser.add_argument(
        "--facebook-group",
        action="append",
        default=[],
        metavar="GROUP_ID",
        help="Numeric Facebook group ID; repeat for several. Off unless supplied.",
    )
    parser.add_argument("--facebook-cookies", default="", help="Path to a cookies.txt exported from a logged-in browser")
    parser.add_argument("--facebook-pages", type=int, default=5, help="Group pages to walk (default: %(default)s)")
    parser.add_argument("--skip-craigslist", action="store_true")
    parser.add_argument("--skip-google", action="store_true")
    parser.add_argument("-o", "--output", default="landscaping_leads.csv", help="CSV path (default: %(default)s)")
    parser.add_argument(
        "--append",
        action="store_true",
        help="Append to the CSV, skipping leads already in it — use this for daily runs",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    return parser


def run(args) -> int:
    session = build_session()
    city = normalize_city(args.city)
    all_leads = []
    statuses = []

    if not args.skip_craigslist:
        log.info("Craigslist: searching %s ...", city)
        result = craigslist.scrape(
            session,
            city=city,
            keywords=args.keywords,
            categories=[c.strip() for c in args.categories.split(",") if c.strip()],
            max_results=args.max_per_source,
        )
        all_leads.extend(result.leads)
        statuses.append(result)

    if not args.skip_google:
        log.info("Google: looking for property managers and HOAs ...")
        result = google_places.scrape(
            session,
            city=args.city,
            state=args.state,
            api_key=args.places_key,
            max_results=args.max_per_source,
        )
        all_leads.extend(result.leads)
        statuses.append(result)

    if args.facebook_group:
        log.info("Facebook: reading %d group(s) ...", len(args.facebook_group))
        result = facebook_groups.scrape(
            group_ids=args.facebook_group,
            cookies_file=args.facebook_cookies,
            pages=args.facebook_pages,
            max_results=args.max_per_source,
        )
        all_leads.extend(result.leads)
        statuses.append(result)

    unique = dedupe(all_leads)

    print("\nSource summary")
    for result in statuses:
        if result.ok:
            print(f"  {result.name:<24} {len(result.leads):>4} leads")
        else:
            print(f"  {result.name:<24}    0 leads — {result.error}")
    if not args.facebook_group:
        print("  Facebook                  skipped (pass --facebook-group to enable)")

    if not unique:
        print("\nNo leads found. Nothing written.")
        return 1

    written = write_csv(unique, args.output, append=args.append)
    with_phone = sum(1 for lead in unique if lead.phone)
    if args.append and written < len(unique):
        print(f"\nWrote {written} new leads to {args.output} ({len(unique) - written} already present).")
    else:
        print(f"\nWrote {written} leads to {args.output}.")
    print(f"{with_phone} of them have a phone number; the rest need a reply form or a site visit.")
    return 0


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(message)s",
    )
    logging.getLogger("facebook_scraper").setLevel(logging.ERROR)
    try:
        return run(args)
    except KeyboardInterrupt:
        print("\nInterrupted.")
        return 130


if __name__ == "__main__":
    sys.exit(main())
