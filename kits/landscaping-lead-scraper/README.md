# Landscaping Lead Scraper

Collects landscaping/lawn-care leads into a CSV you can work down a phone list
with — or serves them as a **phone lead CRM** you tap-to-dial from
(see [SERVICE.md](SERVICE.md)).

Three sources: **Craigslist** (people asking for the work), **Google Places**
(property managers and HOAs to cold call), and **Facebook groups** (opt-in, see
the caveats below).

## Phone app quick start

```bash
cd kits/landscaping-lead-scraper
pip install -r requirements.txt -r requirements-service.txt
python -m leadscraper.service
```

Open the printed link on your phone, Add to Home Screen, done: Today view,
tap-to-dial, status pipeline, follow-ups, per-source win-rate stats. Full
guide in [SERVICE.md](SERVICE.md).

## CLI quick start

```bash
cd kits/landscaping-lead-scraper
pip install -r requirements.txt

python -m leadscraper --city austin --state texas
```

That writes `landscaping_leads.csv` in the current directory.

For a daily run that only ever adds new rows:

```bash
python -m leadscraper --city austin --state texas --append
```

## Output

| column | notes |
| --- | --- |
| `source` | Craigslist / Google Places / Facebook |
| `title` | listing title, or business name |
| `url` | listing link, or company website |
| `phone` | populated when the source exposes one — see below |
| `email` | pulled out of post bodies; Craigslist relay addresses are skipped |
| `address` | Google Places results only |
| `notes` | post body excerpt or the query that matched |

Empty cells are left empty rather than filled with `"N/A"`, so you can sort and
filter on them in a spreadsheet.

## Where the phone numbers come from

This is the part worth understanding before you run it.

- **Craigslist** hides contact info behind its reply form. You get a number only
  when the poster typed one into the body, which a fair number do. Everyone else
  you reach through the listing link.
- **Google Places** returns the business phone number directly — this is the
  source that actually fills the phone column. It needs an API key:

  ```bash
  export GOOGLE_PLACES_API_KEY=your_key_here
  ```

  Get one from the Google Cloud console (Places API). Text Search is billed per
  request and has a monthly free allowance that comfortably covers this usage.

  Without a key the tool falls back to scraping organic search results via the
  optional `googlesearch-python` package. That returns a target list with **no
  phone numbers**, and Google rate-limits it to `HTTP 429` quickly. It is a
  worse tool; the key is worth the five minutes.
- **Facebook** gives you whatever the poster wrote in the post.

## Facebook groups (off by default)

```bash
pip install facebook-scraper
python -m leadscraper --city austin \
  --facebook-group 123456789 \
  --facebook-cookies cookies.txt
```

Cookies come from a "Export cookies" browser extension while logged into
Facebook — without them Facebook serves a login wall to every request.

Two honest caveats:

1. Automated collection violates Meta's Terms of Service, and accounts used this
   way do get restricted. That risk is yours.
2. `facebook_scraper` breaks whenever Meta changes its markup, which is often. A
   run returning zero posts is common and usually not a configuration mistake.

Checking your local groups by hand once a day genuinely is competitive here —
these posts get answered fast, and you'll see them sooner than a nightly job.

## Options

```
--city               required; spaces are stripped for the Craigslist subdomain
--state              used for the Google queries
--keywords           Craigslist search terms
--categories         Craigslist boards, comma separated (default: wan)
--max-per-source     cap per source (default: 100)
--places-key         Google Places key, else $GOOGLE_PLACES_API_KEY
--facebook-group     numeric group ID; repeat the flag for several
--facebook-cookies   path to cookies.txt
--skip-craigslist / --skip-google
-o / --output        CSV path
--append             skip leads already in the CSV
-v / --verbose
```

Useful boards to add via `--categories`: `wan` (wanted), `hss` (household
services), `lbg` (labor / moving).

## Why it reads Craigslist's RSS feed

Craigslist search results are rendered client-side. Fetching `/search/wan` with
`requests` and parsing `li.result-row` / `a.result-title` returns nothing — those
selectors predate the 2021 redesign. The RSS feed for the same query is still
server-rendered, paginates 25 at a time, and needs no browser.

## Running the tests

```bash
pip install pytest
python -m pytest
```

40 tests, no network access required — the HTTP layer is stubbed.

## Rate limiting and terms of service

Requests to a single host are spaced with a jittered 2–4s pause and retried with
backoff on 429/5xx. Craigslist's terms prohibit automated access; the polite
delay reduces the chance of an IP block but does not make the scraping
authorized. The Google Places path is a documented API and is the one source
here you're straightforwardly permitted to use at volume.

## Working the list

What to actually say, per source. These same scripts are one tap-to-copy away
in the phone app's lead detail view.

**Craigslist "wanted" posts** — reply fast with a price and immediate
availability; these posters want the chore gone, not a consultation:

> Hi! I do lawn & landscaping work here in town and have an opening this week.
> For a yard like yours I'd estimate $XX per visit. I'm insured, reliable, and
> can start tomorrow — happy to swing by for a free 5-minute quote.

**Property managers / HOAs (Google leads)** — they buy reliability at volume,
not one-off mows. Ask for the person who owns the vendor list:

> Hi, this is [Name] with [Company] — a local lawn & landscape crew. We work
> with property managers on multi-property routes: one invoice, photo
> check-ins after every visit, and a volume rate when we handle 5+ properties.
> Who handles your landscaping vendor list?

**Facebook group posts** — first useful reply usually wins. Comment publicly
(social proof) *and* DM, within minutes if you can:

> Hey! Local landscaper here — I can take care of this for you. Free quote,
> can come by today or tomorrow. Just sent you a DM.

Track what actually converts in the app's Stats tab (or your own spreadsheet
via the CSV): mark leads won with a job value and your real per-source win
rate builds itself. Don't plan revenue around anyone's quoted close rates —
including numbers you've seen attached to this kind of tool. A "wanted" post
may be weeks stale and a property manager may be mid-contract; the scraper
finds and formats leads, it doesn't qualify them.
