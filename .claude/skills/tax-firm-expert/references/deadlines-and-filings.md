# Deadlines and Filings

Filing dates are structural: they come from the Code and do not drift with
inflation, so they are safe to reason from directly. What follows assumes a
**calendar-year** taxpayer unless noted. For fiscal-year entities, apply the
underlying rule (e.g. "15th day of the 3rd month after year end") rather than
the calendar date.

## Contents

- [The weekend and holiday rule](#the-weekend-and-holiday-rule)
- [Income tax return due dates](#income-tax-return-due-dates)
- [Why the order matters](#why-the-order-matters)
- [Extensions](#extensions)
- [Information returns](#information-returns)
- [Payroll](#payroll)
- [Estimated tax](#estimated-tax)
- [Late filing and late payment exposure](#late-filing-and-late-payment-exposure)
- [Elections with hard deadlines](#elections-with-hard-deadlines)

## The weekend and holiday rule

When a due date falls on a Saturday, Sunday, or legal holiday, it moves to the
next business day. Emancipation Day in the District of Columbia shifts the
April individual deadline in some years even though it is not a national
holiday. Always check the actual calendar for the year in question rather than
assuming April 15.

## Income tax return due dates

| Return | Entity | Original due | Extended |
| --- | --- | --- | --- |
| **1065** | Partnership, multi-member LLC | 15th day of 3rd month — Mar 15 | 6 months — Sep 15 |
| **1120-S** | S corporation | 15th day of 3rd month — Mar 15 | 6 months — Sep 15 |
| **1120** | C corporation | 15th day of 4th month — Apr 15 | 6 months — Oct 15 |
| **1040** | Individual | Apr 15 | 6 months — Oct 15 |
| **1041** | Estate, trust | 15th day of 4th month — Apr 15 | 5½ months — Sep 30 |
| **990 series** | Exempt organization | 15th day of 5th month — May 15 | 6 months — Nov 15 |
| **709** | Gift tax | Apr 15 | Follows the donor's 1040 extension, or Form 8892 |
| **706** | Estate tax | 9 months after death | 6 months — Form 4768 |
| **FinCEN 114 (FBAR)** | Foreign accounts | Apr 15 | Automatic to Oct 15, no form required |

Note the two irregular ones, since they are easy to get wrong: **1041 extends
5½ months, not 6**, landing on September 30. C corporations with a **June 30**
year end have historically had a different extension period than other fiscal
years — verify before relying on it.

## Why the order matters

Passthrough returns are due a full month before the individual returns they
feed. That is deliberate: a partner or shareholder cannot finish a 1040 without
the K-1. In practice this means a late 1065 or 1120-S does not just delay itself
— it strands every individual return downstream, and those taxpayers then need
extensions of their own.

When triaging a busy season, passthrough returns with individual returns behind
them are worth more than their own hours suggest.

## Extensions

An extension extends **time to file, not time to pay**. Tax is due at the
original date. An extension filed without a reasonable estimate of the balance
due can be treated as invalid, which retroactively exposes the taxpayer to
failure-to-file penalties.

| Form | Extends |
| --- | --- |
| **4868** | Individual (1040) |
| **7004** | Business returns (1065, 1120, 1120-S, 1041, and others) |
| **8868** | Exempt organizations (990 series) |

Practical guidance for a firm: decide extensions deliberately and early. An
extension filed in week six, when a return is clearly not going to make it, is
a professional decision that protects the returns that still can. The same
extension filed on April 14 is damage control, and by then the capacity it
would have freed has already been spent.

## Information returns

These carry per-form penalties that scale with lateness and with the size of the
filer, and they are cheap to get right and expensive to miss.

| Form | To recipient | To IRS/SSA |
| --- | --- | --- |
| **W-2** | Jan 31 | Jan 31 (SSA) |
| **1099-NEC** | Jan 31 | Jan 31 |
| **1099-MISC** | Jan 31 (Feb 15 for some boxes) | Feb 28 paper / Mar 31 e-file |
| **1099-INT, -DIV, -B** | Feb 15 for consolidated broker statements | Feb 28 paper / Mar 31 e-file |
| **1095-C** | Varies — check the year | Feb 28 paper / Mar 31 e-file |
| **Schedule K-1** | With the return | With the return |

Two operational notes. First, the **electronic filing threshold for information
returns has been lowered substantially** — far more filers are now required to
e-file than in the past, and the threshold aggregates across form types. Verify
the current threshold rather than assuming a client is under it. Second,
brokerage consolidated 1099s are frequently **corrected** in March; a return
prepared from a February statement may need amending. It is worth waiting or
at least flagging.

## Payroll

| Form | Covers | Due |
| --- | --- | --- |
| **941** | Quarterly federal payroll | End of month following quarter end — Apr 30, Jul 31, Oct 31, Jan 31 |
| **940** | Annual FUTA | Jan 31 |
| **944** | Annual, small employers by IRS designation | Jan 31 |
| **W-3** | W-2 transmittal | Jan 31 |

Federal tax deposits run on their own schedule — monthly or semi-weekly,
determined by lookback-period liability — and that schedule is separate from the
return due dates above. Deposit penalties are common and avoidable.

## Estimated tax

Individual estimated payments are due **April 15, June 15, September 15, and
January 15** of the following year. Note that the periods are uneven: the second
"quarter" covers two months.

The safe harbor structure is stable even though one of its numbers is not:
pay the lesser of a set percentage of the current year's tax or a set percentage
of the prior year's tax, with the **prior-year percentage increasing for
higher-income taxpayers**. Treat both percentages as figures to verify.

C corporations follow a different quarterly schedule and have their own
underpayment rules — do not apply individual safe harbors to them.

## Late filing and late payment exposure

Understanding the relative magnitude helps a practitioner triage correctly:

- **Failure to file** is by far the more expensive penalty per month, and it
  runs on the unpaid balance. This is why filing on time — or extending — is
  more urgent than paying on time.
- **Failure to pay** is much smaller per month but accrues alongside interest.
- **Partnership and S corporation late filing** penalties are charged **per
  partner or shareholder, per month**. For an entity with many owners this grows
  alarmingly fast and is the single strongest argument for extending a
  passthrough that will not make March 15.
- **First-time penalty abatement** is available to otherwise-compliant
  taxpayers and is frequently under-claimed. It is worth checking before paying
  a penalty.

Verify the current penalty rates, monthly caps, and minimum amounts — several
are inflation-adjusted.

## Elections with hard deadlines

These are unforgiving, and missing one is a malpractice risk rather than an
inconvenience.

- **S corporation election (Form 2553)** — due within roughly the first
  2½ months of the tax year it is to take effect, or any time in the preceding
  year. Late-election relief exists under revenue procedures and is commonly
  available, but should not be the plan.
- **Entity classification election (Form 8832)** — effective date can be set up
  to 75 days before filing, with a 12-month look-forward limit. Changing
  classification again within 60 months is generally restricted.
- **§754 election** — made on a timely filed partnership return, including
  extensions. Once made it binds future years unless revoked with consent.
- **Certain accounting method changes (Form 3115)** — timing depends on whether
  the change is automatic or requires consent.
- **Installment sale election out (§453)** — made on a timely filed return for
  the year of sale.
- **QSST/ESBT elections** for trusts holding S corporation stock have short
  windows tied to when the trust receives the stock.

When a client raises anything in this list, establish the relevant date before
discussing the substance. The answer to "should we elect S status" is very
different in January than in June.
