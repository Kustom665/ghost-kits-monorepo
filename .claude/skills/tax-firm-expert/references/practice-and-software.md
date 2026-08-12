# Practice Operations and Software

For two related tasks: advising a firm on how its season actually runs, and
building software for firms without getting the domain model wrong.

## Contents

- [Where firms actually lose the season](#where-firms-actually-lose-the-season)
- [Measuring flow rather than status](#measuring-flow-rather-than-status)
- [The pipeline as a model](#the-pipeline-as-a-model)
- [Modeling tax concepts in software](#modeling-tax-concepts-in-software)
- [Data handling and confidentiality](#data-handling-and-confidentiality)

## Where firms actually lose the season

Firms rarely fail because staff are slow. They fail at a small number of
predictable choke points, and the reason they persist is that each one looks
like a valid status rather than a problem.

**Waiting on client documents.** The largest single pool of stalled work in most
practices. It looks acceptable — the firm is not the blocker — so nothing
escalates. Meanwhile budgeted hours sit unusable and arrive all at once later.
The fix is a chase cadence with specific asks, not a second organizer mailing.
A follow-up naming the three missing items gets answered; "please send your
documents" does not.

**The review queue.** Work routes to the most trusted reviewer, who becomes a
hard ceiling on the firm's throughput no matter how much prep capacity exists.
Prep is easy to add and review is not, so the queue in front of one or two
people is where returns actually age.

**Rework.** A review kickback costs the preparer's time, the reviewer's time
twice, and another full trip through the queue. A firm with a high kickback rate
has a training or checklist problem upstream that is quietly consuming reviewer
capacity — the scarcest thing it has.

**Late extension decisions.** Extensions decided at the deadline instead of in
week six. By then the capacity that a deliberate extension would have freed has
already been spent on a return that was never going to make it.

**Signature and e-file authorization.** Returns finished but sitting unfiled
waiting on a signed Form 8879. Work that is 100% complete and earning nothing.

**Scope creep on fixed-fee work.** Bookkeeping cleanup absorbed into a tax
engagement without a conversation. It shows up as a realization problem months
later, long after the cause is fixable.

When asked to diagnose a firm, ask which of these it is before proposing
anything. The remedies are completely different, and the most common error is
treating a client-responsiveness problem as a staffing problem.

## Measuring flow rather than status

Most practice management reporting answers "where is this return?" The more
useful question is "how fast is work moving, and where does it stop?"

A few principles worth applying, whether advising or building:

**Measure from an event log, not a status field.** Record every stage
transition with a timestamp. Cycle times, throughput, and aging all derive from
it, and a stored status can drift from reality while an event log cannot.

**Use median and p90, not mean.** Tax cycle times are heavily right-skewed. The
mean is dragged around by a handful of pathological returns and hides the tail
that is actually causing pain.

**Exclude in-progress work from cycle time statistics.** A return that entered
review an hour ago is not a one-hour review. Including open intervals drags every
median toward zero and makes a struggling stage look healthy.

**Queue depth is WIP divided by clearance rate.** A stage holding 60 returns
that clears 60 a week is fine. A stage holding 18 that clears 4 a week is where
the season dies. Raw counts mislead; weeks-of-backlog does not.

**Watch arrivals against throughput.** A queue where arrivals exceed clearance is
growing, and it will not recover on its own. That is a leading indicator; aging
is a lagging one.

**Separate deadline cohorts.** A firm is never working one deadline. March 15
passthroughs and April 15 individuals compete for the same reviewers, and a
single countdown hides that. When computing whether a cohort will clear in time,
credit it only its share of the stage's throughput — otherwise a rate that is
serving 150 returns looks like it is dedicated to 40.

**Distinguish who owns the wait.** Time waiting on a client and time waiting on
a reviewer look identical in a status report and require opposite responses.
Tag every stage with its owner.

## The pipeline as a model

A workable stage model for a tax engagement, with the owner of each stage:

| Stage | Owner | Notes |
| --- | --- | --- |
| Intake | Firm | Engagement letter, organizer, prior year rolled forward |
| Awaiting documents | **Client** | The biggest silent pool |
| Ready for prep | Firm | Queue — capacity constrained |
| In preparation | Firm | Active work |
| Review queue | Firm | Queue — usually the true constraint |
| In review | Firm | Active work; can kick back to preparation |
| Partner sign-off | Firm | Queue |
| Awaiting signature | **Client** | Form 8879 |
| E-file transmitted | Firm | Awaiting acknowledgement |
| Accepted / Extended | — | Terminal |

The kickback edge from review back to preparation is essential to model. A
pipeline that only moves forward cannot measure rework, and rework is one of the
most expensive things in the practice.

## Modeling tax concepts in software

Domain mistakes that make tax software subtly wrong:

**Entity type is not one field.** Legal form, federal tax classification, and
elections in effect are three different things. An LLC taxed as an S corporation
needs all three represented.

**Deadlines are computed, not stored as a constant.** They derive from entity
type, year end, extension status, and the weekend-and-holiday rule. Hard-coding
April 15 breaks for every fiscal-year entity and in years where the date shifts.

**A client is not a return.** One client can have several returns in a year
(entity plus owners' individual returns, multiple states, prior-year catch-ups)
and relationships among them. The individual return often cannot start until the
entity K-1 exists — that dependency is real and worth modeling.

**Tax year and filing year are different.** A 2025 return is prepared in 2026,
and a firm works several tax years at once.

**Amendments and superseding returns** are distinct from the original and from
each other, and both need to exist without destroying the original record.

**Money is not a float.** Use integer cents or a decimal type. Tax figures are
rounded at specific points by rule, and rounding at the wrong step produces
figures that do not tie.

**Indexed figures belong in a year-keyed table**, never in code. Mileage rates,
contribution limits, and thresholds change annually, and a constant embedded in
a function is a bug scheduled for January.

**Never auto-file or auto-transmit.** Filing is a professional act requiring a
signature and a human decision. Software should prepare and queue; a person
releases.

## Data handling and confidentiality

Tax data is among the most sensitive information a business holds, and the
obligations are legal rather than aspirational.

- **IRC §7216** restricts a preparer's use and disclosure of taxpayer
  information, including for the preparer's own marketing, and requires specific
  consent in a prescribed form. This catches firms out when they want to use
  return data for advisory upsell.
- **The FTC Safeguards Rule** requires a written information security program
  for tax preparers, with named responsibility, risk assessment, access
  controls, encryption, and vendor oversight.
- **A written data security plan** is required in order to obtain or maintain a
  PTIN.
- **State breach notification** obligations apply and vary.

Practical implications for anything built or advised on: encrypt in transit and
at rest, no taxpayer data in logs or analytics payloads, multi-factor
authentication, least-privilege access with an audit trail, and explicit
retention and deletion policy. Do not send SSNs or full returns over unencrypted
email — use a portal. When integrating a third-party service, remember that the
firm remains responsible for its vendors.

If asked to build something that would move taxpayer data somewhere unprotected,
say so rather than building it quietly.
