"""Serve the lead CRM: `python -m leadscraper.service [--every 12 --city austin]`."""

import argparse
import logging
import socket
import sys


def lan_ip() -> str:
    """Best-effort LAN address via the UDP-connect trick (no packet is sent)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("192.0.2.1", 80))  # TEST-NET; never actually routed to
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def print_banner(url: str, token: str) -> None:
    print()
    print("  Lead CRM is running.")
    print(f"  On your phone, open:  {url}")
    print(f"  (token: {token} — the link above already includes it)")
    try:
        import qrcode

        qr = qrcode.QRCode(border=1)
        qr.add_data(url)
        qr.make(fit=True)
        qr.print_ascii(invert=True)
        print("  Point your phone's camera at the code above.")
    except ImportError:
        print("  Tip: `pip install qrcode` to get a scannable QR code here.")
    print("  Then tap Share -> Add to Home Screen for an app-like icon.")
    print()
    print("  Do NOT port-forward or tunnel this to the internet. For access")
    print("  away from home, use Tailscale. See SERVICE.md.")
    print()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="leadscraper.service", description="Serve the phone lead CRM.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--every", type=float, default=0,
                        help="Re-scrape every N hours (requires --city)")
    parser.add_argument("--city", default="", help="City for scheduled re-scrapes")
    parser.add_argument("--state", default="", help="State for scheduled re-scrapes")
    parser.add_argument("--max-per-source", type=int, default=50)
    args = parser.parse_args(argv)

    if args.every and not args.city:
        parser.error("--every requires --city so the scheduler knows what to search")

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    try:
        import uvicorn
    except ImportError:
        print("The service needs extra packages: pip install -r requirements-service.txt")
        return 1

    from ..pipeline import SearchRequest
    from .app import create_app
    from .config import db_path, load_or_create_token
    from .jobs import JobRunner
    from .store import Store

    store = Store(db_path())
    orphaned = store.fail_orphaned_jobs()
    if orphaned:
        print(f"  (marked {orphaned} interrupted job(s) from a previous run as failed)")

    runner = JobRunner(store)
    token = load_or_create_token()
    app = create_app(store=store, runner=runner, token=token)

    if args.every:
        from .scheduler import Scheduler

        def make_request():
            return SearchRequest(
                city=args.city, state=args.state, max_per_source=args.max_per_source
            )

        scheduler = Scheduler(store, runner, make_request, every_hours=args.every)
        scheduler.start()
        print(f"  Re-scraping {args.city} every {args.every:g} hour(s).")

    url = f"http://{lan_ip()}:{args.port}/?token={token}"
    print_banner(url, token)

    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
