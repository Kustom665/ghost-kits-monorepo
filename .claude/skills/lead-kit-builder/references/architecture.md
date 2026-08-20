# Lead Kit Architecture Reference

The reference implementation is `kits/landscaping-lead-scraper/`. This file
records the decisions and contracts so a new kit (or a big change to an
existing one) doesn't re-litigate them.

## Package layout

```
kits/<trade>-lead-scraper/
├── leadscraper/
│   ├── models.py        Lead dataclass (source,title,url,phone,email,address,notes),
│   │                    SourceResult(name, leads, error, warnings, .ok property)
│   ├── extract.py       PURE (no I/O): phone/email regexes, normalize_phone,
│   │                    canonical_url, dedupe_key, dedupe(leads, seen=None)
│   ├── http.py          build_session() with Retry(429/5xx), polite_pause()
│   ├── pipeline.py      SearchRequest, SearchOutcome, run_search() — the ONE
│   │                    orchestration both CLI and service call
│   ├── export.py        write_csv(append=), existing_keys() for daily-run dedupe
│   ├── cli.py           argparse; run() is a thin caller of run_search()
│   ├── sources/         one module per source, each exposing scrape() -> SourceResult
│   └── service/
│       ├── config.py    ~/.leadscraper dir, token create/load (0600), limits
│       ├── store.py     SQLite; per-op connections + WAL (two writer threads)
│       ├── jobs.py      JobRunner: ThreadPoolExecutor(max_workers=1)
│       ├── scheduler.py --every N: pure should_fire()/next_run() + thin thread
│       ├── schemas.py   pydantic validation = the security boundary
│       ├── app.py       create_app() factory; ALL routes sync def
│       ├── __main__.py  banner: LAN IP + token URL + optional ASCII QR
│       └── static/index.html   the entire phone client, self-contained
├── tests/               fakes.py + per-module suites; no network anywhere
├── requirements.txt     requests, beautifulsoup4 only (CLI stays lean)
├── requirements-service.txt  fastapi, uvicorn, httpx (+optional qrcode)
├── README.md            sources, phone-number reality, ToS caveats, scripts
└── SERVICE.md           phone setup, security posture
```

## Key decisions and why

**Sources return, never raise.** Expected failures (network, non-200, parse
errors, missing optional deps) become `result.error` (zero leads) or
`result.warnings` (partial). One dead source must not kill a run; `cli.run`
and the API both render per-source status lines.

**Signature asymmetry is absorbed in pipeline.py.** craigslist/google take
`(session, ..., pause=)`; facebook takes neither (its library owns its own
network stack). `run_search` is the only place that knows this.

**Job-based API.** `POST /api/searches` → 202 `{job_id}`; poll
`GET /api/searches/{id}` every 2s. 409 (with the running job_id) when busy —
enforced structurally by the single-worker executor. Cancel is best-effort,
checked between sources; urllib3 backoff sleeps aren't interruptible, so say
"stops after the current source" in the UI. The real runtime bound is the
schema cap on max_per_source (default 50, max 200).

**SQLite contract.** Leads keyed by `dedupe_key(lead)` (canonical URL, else
source::title). The upsert's `ON CONFLICT(key) DO UPDATE` lists scraped
columns explicitly and OMITS status/user_notes/next_action/job_value/
called_at/first_seen. Statuses: new|called|follow_up|won|lost. Today ordering:
due follow-ups first, then new-with-phone, then last_seen DESC. Stats:
contacted = status != 'new'; win_rate = won/contacted (null when contacted=0);
revenue = SUM(job_value) where won.

**Threading rules.** Routes are sync `def` → Starlette threadpool (blocking
sqlite can't stall the loop, no per-call-site vigilance). Fresh sqlite
connection per operation + WAL. requests.Session per run, not shared across
threads.

**Endpoint set.**
```
GET  /                     page (unauthenticated; token arrives as ?token= once,
                           JS stores to localStorage, strips from URL)
GET  /api/health           open: {ok, version, auth_required}
POST /api/searches         202/409/422; body has NO places_key, NO facebook
GET  /api/searches/{id}    status, phase, sources[{name,count,ok,error,warnings}]
POST /api/searches/{id}/cancel   202 best-effort
GET  /api/leads            ?status=&has_phone=&limit=&offset= → {total, leads[]}
PATCH /api/leads           key in BODY (keys are URLs; path-encoding them breeds
                           double-decode bugs) + status/user_notes/next_action/job_value
GET  /api/stats            per-source funnel + totals
GET  /api/leads.csv        export incl. status columns
```

**Auth.** One static bearer token (secrets.token_urlsafe(24)), file mode 0600,
compared with hmac.compare_digest. Health and the page stay open (page needs
to load before it has the token; health lets "test connection" distinguish
server-down from bad-token). No CORS middleware — the page is same-origin.

**Page rules.** One file, vanilla JS, no CDN/build step. `tel:` links for
dialing (digits only in the href). Tapping Call optimistically PATCHes
new→called; the status row is the undo. apple-mobile-web-app meta for Add to
Home Screen. Escape everything interpolated into HTML (the `esc()` helper) —
lead titles are attacker-controlled text from the open internet.

**Scraping etiquette.** Jittered 2–4s pause between same-host requests
(pause flag off in tests and service-internal calls where the source allows),
Retry with backoff on 429/5xx, honest README section stating Craigslist ToS
prohibits automated access and the polite delay doesn't change that.

## Sandbox reality

Remote sandboxes commonly block scrape targets at the proxy (CONNECT 403).
Craigslist/Google live paths then can't be verified — verify everything else
(full test suite, loopback server boot, page fetch, auth split) and state the
gap explicitly in the PR body. Never imply a live scrape was tested when it
wasn't.
