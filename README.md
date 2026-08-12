# Ghost Kits Monorepo

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
