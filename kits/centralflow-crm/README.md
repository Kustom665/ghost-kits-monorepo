# CentralFlow

An agency CRM built around the shared client inbox, because that is where
agencies actually lose accounts. Nobody churns over a missing pipeline board;
they churn because they wrote in on Thursday and heard back on Tuesday.

```bash
cd kits/centralflow-crm
npm install
npm run seed     # generates a realistic 15-account demo agency
npm run dev      # http://localhost:3001
```

Requires Node 22.5+ — it uses the built-in `node:sqlite`, so there is no
database to install and nothing native to compile. The kit is self-contained:
its own dependencies, its own database file under `.data/`, no shared build.

## The idea

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

## What makes the numbers trustworthy

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

## Live updates

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

## Screens

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

## Layout

```
src/core        Pure domain logic — no framework, no I/O, no imports from the app.
  time.ts       Business-hours arithmetic (the clock everything else uses)
  sla.ts        Response budgets per tier, breach assessment
  triage.ts     Inbox ranking, folders, filters
  pipeline.ts   Measured stage probabilities, dwell, stalls, forecast
  accounts.ts   Account health, team load, reply drafting

src/app         Next.js 16 routes. Server components read; server actions write.
src/db          Schema, queries and the correspondence simulation
src/components  Rail, conversation row, live indicator, shared primitives
server.mjs      Node HTTP server: Next mounted inside it, WebSocket on /ws
tests/          43 tests against src/core, run by node:test
```

The core keeps its own directory and imports nothing from the app — it is
reached as `#core` (a package.json subpath import), which resolves the same way
under Next, `tsc` and plain `node`. That is the whole enforcement mechanism: if
domain logic ever reaches for a request or a database handle, the import will
not be there.

## Commands

All run from `kits/centralflow-crm`.

| | |
| --- | --- |
| `npm run dev` | Start the app with live reload (seeds automatically on first run) |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run seed` | Regenerate the demo agency |
| `npm test` | The domain test suite |
| `npm run typecheck` | Type-check the kit |

Both `dev` and `start` run `server.mjs`, so the WebSocket is present either way.
`PORT` overrides the default 3001.

To watch the live layer work, open the app in two windows, reply to a thread in
one, and leave the other alone — the counts in its rail move on their own.

## Notes on the demo data

The seed simulates correspondence rather than stamping rows with the numbers we
want to see. Threads are built backwards from a chosen amount of *working* wait
so the queue lands on a deliberate spread of clear, due-soon and breached; every
message falls on a real working hour; and the conversation cache is rebuilt from
the messages afterwards, so the inbox, the SLA figures and the health scores
agree because they are all reading the same thread.

It is deterministic — the same seed produces the same agency every time.

## Not yet wired

Sending a reply records it on the thread but does not hand it to a mail
provider; connecting one is a swap of `sendReply` rather than a change to
anything that reads. Authentication is also out of scope — the signed-in user
is a setting — but every read path takes the viewer as a parameter rather than
reaching for a global, so adding real auth is a small change.

## Hosting

This wants a plain Node host — anywhere `npm start` can run as a long-lived
process. It is not a fit for serverless: functions do not hold a WebSocket open,
and `node:sqlite` writes to a local file that a serverless filesystem will not
keep. Moving it there means swapping SQLite for Postgres and the in-process bus
for hosted pub/sub; nothing in `src/core` would change.
