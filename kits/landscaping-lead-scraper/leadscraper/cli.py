"""Command line entry point.

    python -m leadscraper --city austin --state texas
"""

import argparse
import logging
import sys

from .export import write_csv
from .pipeline import SearchRequest, normalize_city, run_search
from .sources import craigslist

__all__ = ["build_parser", "main", "normalize_city", "run"]

log = logging.getLogger("leadscraper")


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


def _request_from_args(args) -> SearchRequest:
    return SearchRequest(
        city=args.city,
        state=args.state,
        keywords=args.keywords,
        categories=tuple(c.strip() for c in args.categories.split(",") if c.strip()),
        max_per_source=args.max_per_source,
        places_key=args.places_key,
        facebook_groups=tuple(args.facebook_group),
        facebook_cookies=args.facebook_cookies,
        facebook_pages=args.facebook_pages,
        skip_craigslist=args.skip_craigslist,
        skip_google=args.skip_google,
    )


def run(args) -> int:
    outcome = run_search(
        _request_from_args(args),
        on_source=lambda r: log.info("%s: %d leads", r.name, len(r.leads)),
    )

    print("\nSource summary")
    for result in outcome.results:
        if result.ok:
            print(f"  {result.name:<24} {len(result.leads):>4} leads")
        else:
            print(f"  {result.name:<24}    0 leads — {result.error}")
        for warning in result.warnings:
            print(f"    ⚠ {warning}")
    for note in outcome.skipped:
        print(f"  {note}")

    if not outcome.leads:
        print("\nNo leads found. Nothing written.")
        return 1

    written = write_csv(outcome.leads, args.output, append=args.append)
    with_phone = sum(1 for lead in outcome.leads if lead.phone)
    if args.append and written < len(outcome.leads):
        print(f"\nWrote {written} new leads to {args.output} ({len(outcome.leads) - written} already present).")
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
