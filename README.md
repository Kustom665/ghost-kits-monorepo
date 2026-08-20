# Ghost Kits Monorepo

Two operations tools for service businesses, sharing a shape: a framework-free
domain package with the thinking in it, and a Next.js app that renders it.

| | What it answers | Run it |
| --- | --- | --- |
| [**TaxFlow Radar**](#taxflow-radar) | What is gating our busy season today? | `npm run dev` → :3000 |
| [**CentralFlow**](#centralflow) | Which client is waiting on us, and what is it costing? | `npm run dev:crm` → :3001 |

---

## TaxFlow Radar

A busy-season operations tool for accounting and tax firms. It answers one
question that most practices cannot answer in March: **what is actually gating
the season, and what should we do about it today?**

Most practice-management software tracks *status*. This tracks *flow* — how fast
work moves, where it piles up, and who it piles up behind.

```bash
npm install
npm run seed     # generates a realistic 245-return demo firm
npm run dev      # http://localhost:3000
```

Requires Node 22.5+ (uses the built-in `node:sqlite`, so there are no native
dependencies to compile).

---

### The bottlenecks it was built to find

Firms lose their season in a handful of predictable places. Each screen targets
one of them.

| Bottleneck | What actually goes wrong | Where it surfaces |
| --- | --- | --- |
| **Document collection** | Returns sit for weeks waiting on a client, and nobody notices because "waiting on the client" feels like a valid status | Doc Chase |
| **Review queue** | Everything routes to the one trusted senior reviewer, who becomes a hard throughput ceiling | Radar, Capacity |
| **Silent stalls** | A return sits untouched for 40 days and only surfaces when someone happens to look | Radar → Oldest stalls |
| **Rework** | Kickbacks cost the preparer's time, the reviewer's time twice, and another full trip through the queue | Radar → Review kickbacks |
| **Late extension calls** | Extensions get decided on April 14 instead of in week six, so the returns that *could* have made it don't | Triage |

### What makes the numbers trustworthy

Every timing figure is derived from an append-only `stage_events` log rather
than stored on the return, so the dashboard cannot drift away from what actually
happened.

- **Cycle times** use completed passes through a stage only. A return that
  entered review an hour ago is not a one-hour review, and including those
  censored intervals would drag every median toward zero.
- **p90, not mean.** Tax cycle times are heavily right-skewed; the mean hides
  exactly the returns that are hurting you.
- **Queue depth** uses Little's Law — WIP ÷ clearance rate — so a stage holding
  60 returns that clears 60 a week is correctly reported as healthy, while one
  holding 18 that clears 4 is correctly reported as the constraint.
- **Deadline cohorts are kept separate.** A firm is never working one deadline.
  September partnership returns and October individual returns compete for the
  same reviewers, so the capacity math credits each cohort only its proportional
  share of throughput instead of the whole rate.
- **The remedy depends on who owns the wait.** A queue owned by the firm is
  fixed with capacity; one owned by the client is fixed with follow-up cadence.
  Conflating the two is why firms hire when they should be calling.

### Screens

- **Radar** — the constraint, stated plainly, with the capacity gap against the
  nearest deadline and the number of returns projected to miss it.
- **Pipeline** — every open return projected against its own due date, sorted by
  least slack first.
- **Doc Chase** — who to call first, ranked by silence, deadline pressure and
  engagement value, with a pre-drafted nudge naming that client's specific
  missing documents. Temperature measures *silence*, not how long ago you asked:
  a client who sent three items yesterday is still warm.
- **Capacity** — per-person queue depth and measured clearance rate, because a
  stage-level bottleneck is usually one or two specific people.
- **Triage** — the returns that will miss, ranked so extensions get decided
  deliberately rather than at the deadline.

### Layout

```
packages/core     Pure domain logic — no framework, no I/O. Reusable by a
                  future React Native client or a nightly batch job.
  stages.ts       Pipeline model, SLAs, stage ownership
  bottleneck.ts   Flow rates, constraint identification, capacity gap
  risk.ts         Per-return completion projection and extension triage
  docs.ts         Document catalog, chase scoring, reminder drafting

apps/web          Next.js 16 app. Server components read the DB directly;
                  all writes go through validated server actions.
  src/db          Schema, queries and the seed simulation
```

### Commands

| | |
| --- | --- |
| `npm run dev` | Start the app (seeds automatically on first run) |
| `npm run build` | Production build |
| `npm run seed` | Regenerate the demo firm |
| `npm test` | Core engine test suite |
| `npm run typecheck` | Type-check every workspace |

### Notes on the demo data

The seed simulates each return's real walk through the pipeline — drawing a
dwell time per stage, applying review kickbacks, and stopping wherever the clock
runs out — so the current pipeline, the event log and every derived rate agree
with one another. Deadlines are computed from real statutory filing dates for
each entity type, and the generator is deterministic, so the demo firm is
identical on every seed.

Swap the seed for real data by writing to the same tables; nothing in
`packages/core` knows where the rows came from.

### Not yet wired

The reminder composer drafts and logs the touch but does not send — connecting
it to a mail provider is the one remaining step to make the chase loop
fully automatic. Authentication and multi-tenancy are also out of scope for this
build.

---

## CentralFlow

An agency CRM built around the shared client inbox, because that is where
agencies actually lose accounts. Nobody churns over a missing pipeline board;
they churn because they wrote in on Thursday and heard back on Tuesday.

```bash
npm install
npm run seed:crm   # generates a realistic 15-account demo agency
npm run dev:crm    # http://localhost:3001
```

Requires Node 22.5+ (uses the built-in `node:sqlite`, so there are no native
dependencies to compile). It runs alongside TaxFlow on a separate port and a
separate database file.

### The idea

Most CRMs organise around the deal. For a client-services business that is the
smaller half of the job: the revenue already signed is worth more than the
revenue being chased, and it is defended one reply at a time. So the inbox *is*
the CRM here — accounts, deals and health all hang off the conversation, and
the home screen is a queue that ranks itself.

| Failure | What actually goes wrong | Where it surfaces |
| --- | --- | --- |
| **Slow first reply** | A thread lands, everyone assumes someone else has it, and the client waits two days for an acknowledgement | Inbox, ranked by response debt |
| **Unowned threads** | Shared inboxes have no owner by default, so the cheapest fix in the shop is also the least visible | Inbox → Unassigned, Pulse |
| **Silent accounts** | A flagship goes quiet for three weeks and nobody notices until the renewal call | Accounts → health |
| **One person underwater** | A shop-wide breach count is almost always one or two people carrying it | Pulse → who is carrying the queue |
| **Deals going cold** | A proposal sits three weeks past the point where this shop's deals normally move | Pipeline → sitting too long |

### What makes the numbers trustworthy

Every timing figure is derived from the `messages` table rather than stored on
the conversation, so the inbox cannot drift away from the actual correspondence.

- **Working hours, always.** A message that lands at 6pm Friday and is answered
  at 9:30 Monday was answered in half an hour, not sixty-three. Wall-clock SLA
  dashboards produce exactly one behaviour — people stop trusting them.
- **Only threads we owe.** A thread waiting on the client accrues nothing.
  Counting it as slow is how a response dashboard stops meaning anything.
- **Two budgets, not one.** First reply and follow-up are measured separately,
  because the first one is what clients judge and what converts an inbound
  lead. Prospects get the tightest budget in the shop — one hour — since they
  have no relationship to spend down while they wait.
- **First response means the first one.** It is stored per thread, so a
  twelve-message conversation is still scored on how long the client waited to
  hear from anyone at all, not on the most recent reply.
- **Measured, not assumed.** Stage win rates and stall thresholds come from this
  agency's own closed deals, and fall back to documented defaults only while the
  sample is too thin to support one. Stage dwell counts completed passes only —
  a deal that entered negotiation this morning is not a zero-day negotiation.
- **The ranking explains itself.** Every point the triage score adds comes back
  out as a sentence, because a queue order nobody can interrogate is a queue
  order nobody follows.

### Live updates

A shared inbox is the one screen where a stale page is actively harmful — two
people answer the same client because neither could see the other pick it up. So
the app runs behind a small custom server (`server.mjs`) that mounts Next inside
a plain Node HTTP server and holds a WebSocket open on `/ws`.

The socket carries **notifications, not data**: a frame saying "conversation
cv_84 changed", after which the browser re-requests the server-rendered page.
Mirroring conversations into a client-side store would mean a second
implementation of the ranking and the SLA clock, free to disagree with the first;
this way there is still exactly one, on the server.

- Replies, assignment, snooze, close and deal moves all broadcast.
- The rail shows connection state and how many tabs are attached.
- A disconnected tab backs off and retries, and re-reads on reconnect — whatever
  changed while it was away is invisible until it asks.
- Open pages also re-render once a minute while visible, because the clocks on
  screen are relative and have to move on their own.

The bus is a single-process `EventEmitter` on `globalThis` (the custom server and
the app's server actions share a process but not a module registry). That is
right for one shop on one server, and it is the piece to swap for Redis pub/sub
the day it runs on more than one instance — the publish/subscribe shape does not
change.

### Screens

- **Inbox** — the shared queue, ranked by what a slow reply costs: response debt
  against the account's target, the size of the relationship, whether a live
  deal is attached, and whether anyone owns it. Folders, search, and filters by
  who is blocked.
- **Conversation** — the thread, an SLA statement in plain language, assignment
  and snooze, and a composer pre-filled with a draft that names the thread and
  the wait and then stops before promising anything you have not decided.
- **Pipeline** — the board, weighted by measured win rate, with a 60-day
  forecast and the deals sitting past their stage's slow quartile.
- **Accounts** — health read off behaviour rather than typed into a dropdown:
  response debt, silence measured against what is normal for that tier, on-time
  history, and renewal proximity.
- **Pulse** — the state of the shop in one sentence, including how much retained
  revenue is currently sitting behind a late reply.

### Layout

```
packages/agency-core   Pure domain logic — no framework, no I/O, 41 tests
  time.ts              Business-hours arithmetic (the clock everything else uses)
  sla.ts               Response budgets per tier, breach assessment
  triage.ts            Inbox ranking, folders, filters
  pipeline.ts          Measured stage probabilities, dwell, stalls, forecast
  accounts.ts          Account health, team load, reply drafting

apps/crm               Next.js 16 app on port 3001
  src/db               Schema, queries and the correspondence simulation
```

### Commands

| | |
| --- | --- |
| `npm run dev:crm` | Start the app with live reload (seeds automatically on first run) |
| `npm run build:crm` | Production build |
| `npm run start:crm` | Serve the production build |
| `npm run seed:crm` | Regenerate the demo agency |
| `npm test` | Both core test suites |

Both `dev:crm` and `start:crm` run `server.mjs`, so the WebSocket is present
either way. `PORT` overrides the default 3001.

To watch the live layer work, open the app in two windows, reply to a thread in
one, and leave the other alone — the counts in its rail move on their own.

### Notes on the demo data

The seed simulates correspondence rather than stamping rows with the numbers we
want to see. Threads are built backwards from a chosen amount of *working* wait
so the queue lands on a deliberate spread of clear, due-soon and breached; every
message falls on a real working hour; and the conversation cache is rebuilt from
the messages afterwards, so the inbox, the SLA figures and the health scores
agree because they are all reading the same thread.

It is deterministic — the same seed produces the same agency every time.

### Not yet wired

Sending a reply records it on the thread but does not hand it to a mail
provider; connecting one is a swap of `sendReply` rather than a change to
anything that reads. Authentication is also out of scope — the signed-in user
is a setting — but every read path takes the viewer as a parameter rather than
reaching for a global, so adding real auth is a small change.
