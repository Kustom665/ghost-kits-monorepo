# The Phone Lead CRM

Run the scraper as a small server, work your leads from your phone. No app
store, no build tools — Safari plus "Add to Home Screen".

## Start it

```bash
cd kits/landscaping-lead-scraper
pip install -r requirements.txt -r requirements-service.txt

python -m leadscraper.service
```

The terminal prints something like:

```
  Lead CRM is running.
  On your phone, open:  http://192.168.1.42:8000/?token=xxxxxxxx
```

Install `qrcode` (`pip install qrcode`) and it also prints a QR code — point
your phone's camera at it instead of typing the address.

## Put it on your phone

1. Open the printed link in Safari (phone and computer on the same Wi-Fi).
2. Tap **Share → Add to Home Screen**.
3. It now opens full-screen from an icon, like an app.

The link carries your access token once; the page stores it and then removes
it from the address bar.

## Use it

- **Leads tab** — opens on *Today*: overdue follow-ups first, then fresh leads
  that have phone numbers. Tap a lead to expand it: one big **Call** button
  (dialing also marks it called — flip the status back if you didn't connect),
  the listing link, a status row, follow-up date, notes, and a tap-to-copy
  outreach script matched to the source.
- **Search tab** — city, state, go. Progress appears per source, including
  partial failures ("hss board 404'd") that used to vanish. Searches run one
  at a time. "Stop" finishes the current source first — that's honest, not
  lazy: the underlying HTTP retries can't be interrupted mid-flight.
- **Stats tab** — contacted, won, win rate, and revenue per source, from your
  own logged calls. Mark wins with a dollar value and this becomes the only
  close-rate table worth trusting. CSV download lives here too.

## Fresh leads every morning

```bash
python -m leadscraper.service --every 12 --city austin --state texas
```

Re-scrapes on the interval, deduped against everything already in the
database — your statuses and notes are never touched by a re-scrape. Prefer
cron? Run the plain CLI with `--append` on a schedule instead; both paths
share the same dedupe keys.

## Where things live

| thing | place |
| --- | --- |
| database | `~/.leadscraper/leads.db` (override: `LEADSCRAPER_DB`) |
| access token | `~/.leadscraper/token` (delete it to rotate; re-link your phone after) |
| Google Places key | `GOOGLE_PLACES_API_KEY` env var on the **server** — it never travels to the phone |

Facebook groups are deliberately not exposed over HTTP; that source stays
CLI-only, opted into explicitly (see the README for why).

## Security — read this bit

- The server binds to your local network so your phone can reach it. The
  bearer token is what makes that acceptable.
- **Do not port-forward, ngrok, or tunnel this to the internet.** An exposed
  scraper endpoint is an abuse relay with your IP on it.
- Away-from-home access: install [Tailscale](https://tailscale.com) on both
  devices and use the Tailscale address. Device-level auth, no open ports.
- Traffic on your Wi-Fi is plain HTTP. That's a considered trade: the threat
  model is "someone is already on your home network", and self-signed TLS
  would cost a certificate dance on the phone for little gain here.
