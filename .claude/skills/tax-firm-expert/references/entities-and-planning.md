# Entities and Planning

The recurring substantive questions in a general practice, and the structure
needed to answer them. Figures that are indexed or set by legislation are
deliberately named rather than stated — verify those for the year in question.

## Contents

- [Entity classification](#entity-classification)
- [Choosing an entity](#choosing-an-entity)
- [Reasonable compensation](#reasonable-compensation)
- [Basis, at-risk, and passive: the loss gates](#basis-at-risk-and-passive-the-loss-gates)
- [Distributions](#distributions)
- [Partnership-specific issues](#partnership-specific-issues)
- [QBI (§199A)](#qbi-199a)
- [Depreciation and fixed assets](#depreciation-and-fixed-assets)
- [Common deduction questions](#common-deduction-questions)
- [State issues](#state-issues)

## Entity classification

"LLC" is a state-law status, not a tax classification. Establish the federal
treatment before anything else:

| Structure | Default federal treatment | Can elect |
| --- | --- | --- |
| Single-member LLC | Disregarded — Schedule C, E, or F | S corp or C corp |
| Multi-member LLC | Partnership — 1065 | S corp or C corp |
| Corporation | C corporation — 1120 | S corp (Form 2553) |
| Sole proprietor | Schedule C | Nothing without forming an entity |
| General partnership | Partnership — 1065 | S corp or C corp |

A single-member LLC that is disregarded for income tax is still a **separate
entity for employment and excise tax**. It has its own EIN and files its own
payroll returns. This trips people up regularly.

S corporation eligibility is restrictive and worth checking before advising an
election: a limited number of shareholders (family members can be treated as
one), only individuals and certain trusts and estates as shareholders, no
nonresident alien shareholders, domestic corporation, and **one class of
stock**. Differences in voting rights are permitted; differences in
distribution or liquidation rights are not. Disproportionate distributions are
a common inadvertent second-class-of-stock problem.

## Choosing an entity

The honest framing is that this is a trade-off, not a right answer, and it
turns on numbers the client has to supply.

**S corporation vs. sole proprietor / partnership.** The draw is that only
wages are subject to employment tax; distributions are not. The costs are real
and often understated: payroll administration, a separate return, reasonable
compensation exposure, basis tracking, and less flexibility in allocating
income among owners. The savings only exceed the costs above a certain profit
level, and the crossover depends on the client's specific facts. Do not quote a
rule-of-thumb revenue threshold as if it were general.

**S corporation vs. C corporation.** A C corporation faces two layers of tax on
distributed earnings but a flat corporate rate, and it can retain earnings. It
matters for businesses planning to reinvest heavily, seek institutional
investment, or pursue qualified small business stock treatment under §1202 —
which is only available for C corporation stock and is a genuinely large benefit
when it applies. An S corporation avoids the second layer but pushes income onto
owners' returns whether or not it is distributed.

**Partnership vs. S corporation.** Partnerships are far more flexible:
special allocations, debt included in basis, property contributed and
distributed with less friction, and no single-class-of-stock constraint. S
corporations offer the employment tax structure. For real estate in particular,
partnership treatment is usually strongly preferred, because partners get basis
for entity-level debt and S corporation shareholders generally do not.

Always ask what the client is optimizing for, and over what horizon. An entity
choice that minimizes this year's tax can be expensive to unwind later —
converting an S corporation to a C corporation, or distributing appreciated
property out of a corporation, can trigger significant tax.

## Reasonable compensation

An S corporation shareholder who performs services must be paid reasonable
compensation as W-2 wages before taking distributions. This is among the most
consistently examined issues in small business tax, and "my prior accountant
said zero salary was fine" is not a defense.

What supports a position:

- Comparable compensation data for the role, industry, and geography.
- Time actually devoted to the business, and the nature of the duties.
- What the business would pay a non-owner to do the same work.
- Whether other employees are compensated consistently.
- Documentation contemporaneous with the decision, not reconstructed later.

Structural points worth knowing: reasonable compensation is a **facts and
circumstances** test with no safe harbor, courts have recharacterized
distributions as wages where compensation was unreasonably low, and the exposure
includes payroll taxes plus penalties and interest. Note also that
shareholder-employee health insurance for a more-than-2% shareholder must be
included in W-2 wages to be deductible by the shareholder — a routinely missed
step that surfaces in review.

## Basis, at-risk, and passive: the loss gates

A loss reported on a K-1 is not automatically deductible. It passes through
three gates **in this order**, and stopping at the wrong one is a common error:

1. **Basis** — §1366(d) for S corporations, §704(d) for partnerships. Loss in
   excess of basis is suspended and carries forward indefinitely.
2. **At-risk** — §465. Amounts financed by nonrecourse debt or protected
   against loss may not be at risk even if they are in basis.
3. **Passive activity** — §469. Without material participation the loss is
   passive, deductible only against passive income or on a fully taxable
   disposition of the activity.

**Basis is not the capital account.** The capital account is a book concept
that may be maintained on tax, GAAP, or §704(b) principles; basis is a tax
computation. They diverge routinely, and the loss limitation runs on basis.

**Partnership and S corporation basis differ in a way that matters a lot.**
A partner's basis includes their share of entity-level liabilities; an S
corporation shareholder's stock basis does not. An S corporation shareholder
gets basis from debt only where they lend to the corporation directly — a
personal guarantee of corporate debt does not create basis. This single
difference drives many entity choices, particularly in real estate.

Order of annual basis adjustments matters when a distribution and a loss occur
in the same year: increase for income items first, then decrease for
distributions, then decrease for losses and deductions. Getting this backwards
can turn a nontaxable distribution into a taxable one on paper.

## Distributions

**S corporation.** A distribution is not income. It reduces stock basis; to the
extent it exceeds basis it is generally capital gain. Where the corporation has
accumulated earnings and profits from a prior C corporation life, the ordering
rules involving the accumulated adjustments account become genuinely
complicated — treat that as a research question rather than answering from
memory.

**Partnership.** Cash distributions in excess of basis produce gain. Property
distributions are generally nontaxable but carry over basis, with limits.
Distributions can also trigger gain under the disguised sale rules or the
mixing-bowl provisions if property is contributed and distributed within a
window — worth flagging whenever contributed property moves.

**C corporation.** Distributions are dividends to the extent of earnings and
profits, then a return of basis, then capital gain.

## QBI (§199A)

The deduction for qualified business income from passthrough entities. The
structure is stable; every threshold in it is indexed.

The mechanics: a deduction of a percentage of qualified business income, subject
to limitations that phase in over a taxable income range. Above the phase-in,
the deduction is limited by W-2 wages paid and the basis of qualified property,
and is **disallowed entirely for specified service trades or businesses**
(SSTBs) — health, law, accounting, consulting, financial services, athletics,
performing arts, and any business whose principal asset is the reputation or
skill of its employees or owners.

The practical consequences worth remembering:

- Below the threshold, none of the limitations apply and an SSTB still gets the
  full deduction. Many practitioners over-complicate returns that are nowhere
  near the phase-in.
- Above the threshold, the W-2 wage limitation interacts with the S corporation
  reasonable compensation decision in a way that can reverse the usual advice:
  higher wages reduce QBI but may increase the allowable deduction.
- Rental real estate qualifies only if it rises to a trade or business; there is
  a safe harbor with specific recordkeeping requirements, and it is not
  automatic.
- Aggregation elections can help satisfy the wage and property limits, and have
  their own consistency requirements.

Verify the current thresholds, the deduction percentage, and the wage and
property limitation percentages before computing anything.

## Depreciation and fixed assets

Structure that is stable:

- **MACRS** recovery periods by asset class; residential rental at 27.5 years
  and nonresidential real property at 39 years, straight line, mid-month
  convention.
- **Conventions** — half-year generally, mid-quarter if more than 40% of the
  year's personal property is placed in service in the final quarter, mid-month
  for real property.
- **§179** expensing is elective, limited to business taxable income (with
  carryforward of the excess), and phases out dollar-for-dollar above a
  spending threshold.
- **Bonus depreciation** is automatic unless elected out, applies to qualifying
  property with a recovery period of 20 years or less, and — unlike §179 — can
  create a loss.
- **Qualified improvement property** is 15-year property, which makes it bonus
  eligible. This was the subject of a well-known drafting error later corrected
  retroactively, so older workpapers may be wrong.
- **Listed property** and vehicles have their own limitations, including annual
  caps on passenger automobiles that are indexed.
- **§1245 recapture** on personal property is ordinary income; **§1250** applies
  to real property, with unrecaptured §1250 gain taxed at its own rate.

Verify: the §179 limit and spending phase-out, the bonus percentage for the
placed-in-service date, and the luxury auto caps. All change.

A cost segregation study can accelerate deductions substantially on a building
purchase or major improvement, and is worth raising for larger acquisitions.

## Common deduction questions

- **Ordinary and necessary (§162)** is the baseline test. "Necessary" means
  helpful and appropriate, not indispensable.
- **Home office** requires exclusive and regular use as the principal place of
  business. The simplified method has a rate per square foot with a cap.
  Employees generally cannot claim it under current law.
- **Meals and entertainment** — entertainment is generally nondeductible;
  business meals are partially deductible, with the percentage having changed
  more than once. Verify.
- **Vehicles** — actual expenses or the standard mileage rate. Switching methods
  later is constrained, and the mileage rate is annual. Contemporaneous mileage
  logs matter enormously on examination.
- **Travel** requires being away from the tax home overnight; the tax home is
  the principal place of business, not the residence.
- **Start-up costs (§195)** — a limited amount is deductible currently, with the
  remainder amortized over 15 years. The immediate deduction phases out.
- **Business interest (§163(j))** may be limited for larger taxpayers; there is
  a gross receipts exemption for smaller ones.
- **Hobby loss (§183)** — activities without a profit motive cannot generate
  deductible losses. There is a presumption based on profitability in a number
  of years, but it is only a presumption.

## State issues

Never assume conformity. States diverge on bonus depreciation, §179, QBI, net
operating losses, and the treatment of passthrough income, and several
decouple selectively.

Recurring issues worth raising:

- **Nexus** — economic nexus for sales tax after *Wayfair*, and separately for
  income tax. Remote employees can create nexus.
- **Apportionment** — formulas vary; many states use single-sales-factor with
  market-based sourcing for services.
- **Passthrough entity taxes (PTET)** — most states now offer an entity-level
  election that works around the federal cap on the state and local tax
  deduction. The elections have their own deadlines and are frequently
  beneficial, but the mechanics and whether the resident state grants a credit
  vary by state. Worth checking every year for every multi-state passthrough.
- **Residency** — changing domicile requires more than a driver's license, and
  high-tax states audit it aggressively. Day counts and documentation matter.
