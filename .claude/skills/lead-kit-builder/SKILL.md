---
name: lead-kit-builder
description: Build a lead-generation kit for a local service trade (landscaping, pressure washing, junk removal, cleaning, handyman, etc.) in a given city — a scraper CLI that collects leads into a deduped CSV plus a phone-friendly lead-CRM web service with tap-to-dial, follow-ups, and real win-rate stats. Use this whenever the user wants to find customers/leads/clients for a local service business, scrape Craigslist/Google/Facebook for work requests, build a call list, adapt the landscaping kit to a new trade or city, or asks anything like "build me a lead scraper for X", "find [trade] jobs in [city]", or "make the lead kit for my [trade] business" — even if they paste their own draft scraper code instead of naming the skill.
---

# Lead Kit Builder

Build (or adapt) a two-layer lead kit for a local service trade:

1. **Scraper CLI** — collects leads from Craigslist RSS, Google Places, and
   (opt-in, CLI-only) Facebook groups into a deduplicated CSV.
2. **Phone lead-CRM** — a FastAPI service serving one self-contained HTML page:
   Today view, tap-to-dial, status pipeline, follow-ups, per-source win-rate
   stats. No app store, no build step.

**Reference implementation: `kits/landscaping-lead-scraper/` in this repo.**
Read it before building — most requests are an adaptation of it, not a
green-field build. Its 85 tests define the invariants worth keeping.

## Step 0: Decide adapt vs. build

- Same repo, new trade/city → **adapt**: copy the kit, change keywords, queries
  and outreach scripts (see "Trade adaptation" below). A few hours, not a day.
- Different data sources or a genuinely different shape → **build**, following
  the architecture in `references/architecture.md`.

## Non-negotiables (learned the hard way)

**Verify sources return data TODAY before writing anything.** User-pasted
scraper code is usually already dead: CSS selectors rot, HTML goes client-side
rendered, libraries break. The landscaping kit exists because all three sources
in the user's draft were dead (pre-2021 Craigslist selectors, rate-limited
Google scraping, broken facebook_scraper). Prefer stable machine-readable
endpoints over HTML scraping: RSS feeds (Craigslist's still works), official
APIs (Google Places), documented JSON. If only HTML scraping remains, say so
and set expectations about breakage.

**Never invent conversion numbers.** Briefs for these kits routinely arrive
with fantasy close rates ("30% on Craigslist, $20k/month"). Do not carry them
into the README or UI. Instead, build the stats loop: users mark leads won
with a dollar value, and the kit computes their real per-source win rate.
That feature is the honest replacement for the fake table — include it.

**Call state must survive re-scrapes.** Leads are keyed by a canonical dedupe
key (URL-based). The SQLite upsert refreshes scraped fields only — status,
notes, follow-up dates, job values are never touched by a scrape. This is THE
invariant; it gets a dedicated regression test.

**Security boundaries are part of the shape, not polish:**
- Billable API keys (Google Places) live in the server env, never over HTTP.
- ToS-violating sources (Facebook groups) stay CLI-only, opted into explicitly,
  with the ToS risk documented plainly.
- Any user input that lands in a URL path gets validated at the API boundary
  (Craigslist categories: `^[a-z]{3}$` — this blocks `../..`).
- Bearer token auth, LAN-only guidance, no tunnels/port-forwards documented as
  out of bounds; Tailscale is the one remote-access recommendation.

**Be honest in output.** Empty CSV cells stay empty (not "N/A"). Partial
failures surface as warnings (one dead board must not vanish just because
another board returned leads). Cancel buttons say "stops after current source"
because that's what actually happens.

## Trade adaptation checklist

When adapting to a new trade, change exactly these:

| what | where | example (pressure washing) |
| --- | --- | --- |
| Craigslist keywords | `DEFAULT_KEYWORDS` in sources/craigslist.py | `"pressure washing OR power wash OR driveway cleaning"` |
| Facebook keywords | `DEFAULT_KEYWORDS` in sources/facebook_groups.py | `("pressure wash", "power wash", "driveway", "siding")` |
| Places queries | `default_queries()` in sources/google_places.py | property managers stay; add trade-relevant buyers (HOAs, restaurants with patios) |
| Outreach scripts | `SCRIPTS` in static/index.html + README "Working the list" | rewrite for the trade's buying psychology |
| Kit name/README | directory name, README, root README table | |

Craigslist board codes (`wan` = wanted, `hss` = household services, `lbg` =
labor) rarely change per trade. The pipeline, store, service, and page need no
changes for a trade swap — that's the point of the architecture.

## Build order (for a fresh build)

Follow the commit sequence that worked: each step lands green before the next.

1. Pure core: models, extract (phone/email regex, canonical URL, dedupe), HTTP
   session with retries. Unit tests immediately — they catch real bugs
   (http/https dedupe misses, newlines in CSV cells).
2. Sources, each returning `SourceResult(name, leads, error, warnings)`.
   Errors→`error` only when zero leads; partial failures→`warnings`.
3. Shared pipeline (`run_search`) used by BOTH CLI and service — never two
   orchestrations. Mind the city split: Craigslist wants `sanantonio`
   (subdomain), Google wants `San Antonio` (text query).
4. CLI with `--append` (dedupes against the existing CSV — daily-run safe).
5. Service: SQLite store → job runner (1 worker, job-submit + 2s poll; a
   30–90s scrape must not hold a phone's HTTP request) → FastAPI app factory
   (all routes sync `def` on the threadpool) → static page.
6. Docs: kit README (sources, where phone numbers actually come from, ToS
   caveats), SERVICE.md (phone setup, security), outreach scripts.

Full architectural detail, schema, and endpoint contracts:
`references/architecture.md`.

## Testing rules

- Stub the network with duck-typed fakes (see `tests/fakes.py`): FakeSession
  queues FakeResponses; exhausting the queue returns 404, which conveniently
  ends pagination loops. Pass `pause=False` everywhere in tests.
- The API test suite injects a synchronous fake search into the job runner —
  the whole HTTP surface runs with no threads, no sleeps, no network.
- Keep a frozen key-set contract test on the lead JSON (`set(payload) == {...}`)
  — it's the only mechanical guard against the page JS and API drifting.
- Verify live at the end: boot the server on loopback, curl health/page/auth.
  If the sandbox blocks the scrape targets (proxies often do), say so in the
  PR instead of implying the live path was tested.

## Delivery

Commit in the build-order sequence with each step green. Push, open/update a
draft PR that separates "verified here" from "needs a live run". Tell the user
the one command to start (`python -m leadscraper.service`) and that the
terminal prints a QR code their phone can scan.
