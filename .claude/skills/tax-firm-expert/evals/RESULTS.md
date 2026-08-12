# Eval results

Each eval was run twice — once with the skill loaded, once with no skill at all —
and graded by an independent subagent against the assertions in `evals.json`.

## Iteration 2 (current suite)

| Metric | With skill | Baseline | Delta |
| --- | --- | --- | --- |
| Pass rate | 100% ± 0% | 75% ± 22% | **+0.25** |
| Tokens | 54,157 ± 3,612 | 43,578 ± 1,101 | +10,578 (+24%) |
| Wall clock | 99.7s ± 15.2s | 92.4s ± 18.6s | +7.3s |

**34/34 with the skill, 26/34 baseline. All four evals discriminate** (iteration 1: one of three).

| Eval | With skill | Baseline | Net | What only the skill run got |
| --- | --- | --- | --- | --- |
| `indexed-figure-restraint` | 7/7 | 3/7 | **+4** | Declined to value the §179 limit and the bonus percentage; flagged both for verification; explained the §179/bonus/MACRS ordering |
| `loss-gates-and-missing-facts` | 11/11 | 9/11 | +2 | Declined to value the §461(l) threshold; noted partnership basis includes entity debt, unlike an S corp |
| `basis-trap-baited-premise` | 8/8 | 7/8 | +1 | Ordering of annual basis adjustments |
| `aggressive-position-pushback` | 8/8 | 7/8 | +1 | Consequence if the position fails — deduction disallowed plus penalties and interest |

### What this actually shows

**Indexed-figure restraint is the skill's most reliable contribution, and it reproduces.**
`indexed-figure-restraint` returned 7/7 vs 3/7 in both iterations independently — a stable
result, not noise. The same discipline then appeared unprompted in a second eval: the
baseline asserted the §461(l) threshold as *"roughly $313,000 single / $626,000 MFJ for
2025"*, where the skill run said only *"the threshold is indexed; verify it for the year."*
Four of the eight discriminating assertion-instances are figure-restraint; they span two
unrelated evals.

**Baiting a wrong premise did not work the way it was designed to.** Both
`basis-trap-baited-premise` and `aggressive-position-pushback` hand the model a
confidently-wrong premise to agree with, and **both configurations refused it outright** —
"Not agreed" and "no, not agreed". A capable model does not need the skill to resist these.
The +1 in each case comes from secondary substance the baseline omitted, not from the trap.
The design hypothesis behind these two evals was only half right, and that is worth
recording rather than papering over.

**The cost is real:** +24% tokens and ~7s per invocation, because the skill routes to
reference files. Justified for the figure discipline; less obviously so for content the
model already produces.

## Iteration 1 (superseded)

23/23 with the skill vs 18/23 baseline — but per-eval deltas were **4, 1, 0**. Four of the
five discriminating instances sat in one eval, so most of the suite measured nothing, and
the baseline's 77% ± 30% variance was that single eval dragging the mean.

Two flaws found and fixed:

1. **A rubric that rewarded a worse answer.** The assertion *"Asks about material
   participation and/or real estate professional status"* encodes the naive framing — a
   rental is per se passive under §469(c)(2), so material participation *alone* is
   irrelevant. The skill run got this right and the rubric would have credited a response
   that got it wrong. Re-pointed at the genuine exits (REP under §469(c)(7), the ≤7-day
   short-term-rental exception, §469(i)).

   Fixing it alone would have made the eval correct *and useless*: the baseline
   independently produced per se passivity, all three exits, the active-vs-material
   distinction, and even caught that the $60k was already the member's 30% share. The
   §461(l) figure-restraint assertion is what keeps the eval earning its place.

2. **An eval that could not fail.** `deadline-model-for-software` scored 8/8 in both
   configurations. Dropped, not replaced with a contrived variant — the honest reading is
   that `references/deadlines-and-filings.md` earns nothing measurable, since the model
   already produces the fiscal-year rule, the weekend rollover, the 1041 5½-month quirk and
   the K-1 dependency without help.

## Not done, deliberately

No changes to `SKILL.md` or the reference files. A suite reading 100% gives nothing to
optimise against, and tuning skill prose to four prompts is how skills get overfit. The
next useful step is harder evals — ones the skill itself can fail — not more skill text.

## Reproducing

```bash
# 8 runs: 4 evals x {with skill, no skill}, then grade against evals.json
# and aggregate with skill-creator's scripts.aggregate_benchmark
```

Grading needs a `summary: {passed, total, pass_rate}` block in each `grading.json` — the
aggregator reads `grading["summary"]["pass_rate"]` and silently reports 0% without it. It
also expects `<config>/run-1/grading.json`, while the review viewer reads
`<config>/outputs/`; write both.
