import Link from 'next/link';
import { getAnalytics } from '@/lib/analytics.ts';
import { Badge, Card, CardHeader, EmptyState, Meter, Stat, Td, Th } from '@/components/ui.tsx';
import {
  fmtDate,
  fmtDays,
  fmtHours,
  fmtMoney,
  fmtRate,
  fmtWeeks,
  RISK_TONE,
} from '@/lib/format.ts';

export const dynamic = 'force-dynamic';

const REMEDY_COPY = {
  add_capacity: {
    heading: 'This is a capacity problem.',
    body: 'Work is arriving faster than this stage clears it. Move a person onto it, or stop feeding it until the queue drains.',
  },
  chase_clients: {
    heading: 'This is a follow-up problem, not a staffing one.',
    body: 'Hiring will not move this. The queue clears when clients respond, so the lever is the chase cadence.',
  },
  reduce_scope: {
    heading: 'This is a scope problem.',
    body: 'Returns are taking too long once someone is actually working them. Look at complexity, rework and interruptions.',
  },
} as const;

export default function RadarPage() {
  const a = getAnalytics();
  const { constraint, firmConstraint, capacityGap, chaseSummary, riskSummary } = a;

  const maxWip = Math.max(...a.stageMetrics.map((m) => m.wip), 1);
  const nearest = a.cohorts[0];

  return (
    <div className="flex flex-col gap-6">
      {/* ---- Deadline countdowns ------------------------------------------ */}
      <section>
        <h1 className="text-lg font-semibold tracking-tight">Busy season radar</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>
          {a.openReturns.length} open returns across {a.cohorts.length} filing deadlines.
        </p>

        <div className="scroll-x mt-3 -mx-1 flex gap-3 px-1 pb-1">
          {a.cohorts.map((c) => (
            <div
              key={c.dueDate}
              className="card min-w-[190px] flex-1 p-3"
              style={
                c.daysAway < 30
                  ? { borderColor: 'var(--bad)', background: 'var(--bad-bg)' }
                  : undefined
              }
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{fmtDate(c.dueDate)}</span>
                <span
                  className="tnum text-sm font-semibold"
                  style={{ color: c.daysAway < 30 ? 'var(--bad)' : 'var(--text-muted)' }}
                >
                  {Math.round(c.daysAway)}d
                </span>
              </div>
              <div className="tnum mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {c.count} returns · {fmtHours(c.hours)} budgeted
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {c.entityTypes.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- The constraint ------------------------------------------------ */}
      {constraint ? (
        <Card className="overflow-hidden">
          <div
            className="border-b p-5 hairline"
            style={{ background: 'var(--surface-2)' }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="bad">Constraint</Badge>
              {constraint.isGrowing ? <Badge tone="warn">Queue growing</Badge> : null}
              <Badge tone="neutral">
                {constraint.meta.owner === 'client' ? 'Waiting on clients' : 'Firm-owned'}
              </Badge>
            </div>

            <h2 className="mt-2.5 text-xl font-semibold tracking-tight">
              {constraint.meta.label} is gating your season
            </h2>
            <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--text-muted)' }}>
              {constraint.reason}
            </p>

            <div
              className="mt-3 max-w-3xl rounded-lg border p-3 text-sm hairline"
              style={{ background: 'var(--surface)' }}
            >
              <strong className="font-semibold">
                {REMEDY_COPY[constraint.remedy].heading}
              </strong>{' '}
              <span style={{ color: 'var(--text-muted)' }}>
                {REMEDY_COPY[constraint.remedy].body}
              </span>
            </div>
          </div>

          <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ background: 'var(--border)' }}>
            <Metric
              label="Queued here"
              value={`${constraint.metrics.wip}`}
              hint={`${fmtHours(constraint.metrics.wipHours)} of budgeted work`}
            />
            <Metric
              label="Clearance rate"
              value={fmtRate(constraint.metrics.throughputPerWeek)}
              hint={`${fmtRate(constraint.metrics.arrivalsPerWeek)} arriving`}
            />
            <Metric
              label="Backlog"
              value={fmtWeeks(constraint.metrics.queueWeeks)}
              hint="at the current clearance rate"
              tone="bad"
            />
            <Metric
              label="Past SLA"
              value={`${constraint.metrics.slaBreaches}`}
              hint={`target ${constraint.metrics.slaDays}d · oldest ${fmtDays(constraint.metrics.oldestDays)}`}
              tone={constraint.metrics.slaBreaches > 0 ? 'warn' : 'neutral'}
            />
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState>Nothing is in the pipeline. Seed the database to see the radar.</EmptyState>
        </Card>
      )}

      {/* ---- Capacity gap -------------------------------------------------- */}
      {capacityGap && firmConstraint && nearest ? (
        <Card>
          <CardHeader
            title={`Can you clear ${firmConstraint.meta.label} before ${fmtDate(nearest.dueDate)}?`}
            subtitle={`${capacityGap.mustClear} returns due ${fmtDate(nearest.dueDate)} still have to pass through this stage. This cohort gets roughly ${Math.round(capacityGap.cohortShare * 100)}% of the stage's attention, since later deadlines are competing for the same people.`}
          />
          <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ background: 'var(--border)' }}>
            <Metric label="Needed" value={fmtRate(capacityGap.requiredPerWeek)} hint="to finish in time" />
            <Metric
              label="Actual"
              value={fmtRate(capacityGap.currentPerWeek)}
              hint="this cohort's share of throughput"
            />
            <Metric
              label={capacityGap.gapPerWeek > 0 ? 'Shortfall' : 'Surplus'}
              value={`${capacityGap.gapPerWeek > 0 ? '' : '+'}${Math.abs(capacityGap.gapPerWeek).toFixed(1)}/wk`}
              hint={
                capacityGap.gapPerWeek > 0
                  ? `≈ ${fmtHours(capacityGap.extraHoursPerWeek)}/wk of extra effort`
                  : 'ahead of the required pace'
              }
              tone={capacityGap.gapPerWeek > 0 ? 'bad' : 'ok'}
            />
            <Metric
              label="Projected misses"
              value={`${capacityGap.projectedMisses}`}
              hint={
                capacityGap.projectedMisses > 0
                  ? 'extend these deliberately, not on April 14'
                  : 'this cohort clears in time'
              }
              tone={capacityGap.projectedMisses > 0 ? 'bad' : 'ok'}
            />
          </div>
        </Card>
      ) : null}

      {/* ---- Headline numbers ---------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Blocked on documents"
          value={chaseSummary.returnsBlocked}
          tone={chaseSummary.returnsBlocked > 0 ? 'warn' : 'ok'}
          hint={`${fmtHours(chaseSummary.hoursBlocked)} of work you cannot start`}
        />
        <Stat
          label="Never nudged"
          value={chaseSummary.neverReminded}
          tone={chaseSummary.neverReminded > 0 ? 'bad' : 'ok'}
          hint="clients with outstanding docs and zero reminders sent"
        />
        <Stat
          label="Past stage SLA"
          value={a.stalled.length}
          tone={a.stalled.length > 0 ? 'warn' : 'ok'}
          hint={
            a.stalled.length > 0
              ? `oldest is ${fmtDays(a.stalled[0].daysInStage)} in ${a.stalled[0].meta.label}`
              : 'everything is inside its target'
          }
        />
        <Stat
          label="Fees at risk"
          value={fmtMoney(riskSummary.feesAtRisk)}
          tone={riskSummary.willMiss > 0 ? 'bad' : 'ok'}
          hint={`${riskSummary.willMiss} projected to miss · ${riskSummary.atRisk} at risk`}
        />
      </div>

      {/* ---- Stage funnel --------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Where the work is sitting"
          subtitle="Median and p90 are measured from completed passes through each stage. Backlog is queue depth divided by clearance rate."
          action={
            <Link href="/pipeline" className="text-xs font-medium no-underline" style={{ color: 'var(--info)' }}>
              Open pipeline →
            </Link>
          }
        />
        <div className="scroll-x">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b hairline">
                <Th>Stage</Th>
                <Th>Owner</Th>
                <Th align="right">WIP</Th>
                <Th align="right">Median</Th>
                <Th align="right">p90</Th>
                <Th align="right">SLA</Th>
                <Th align="right">Over</Th>
                <Th align="right">In</Th>
                <Th align="right">Out</Th>
                <Th align="right">Backlog</Th>
                <Th className="w-32">Share</Th>
              </tr>
            </thead>
            <tbody>
              {a.stageMetrics.map((m) => {
                const isConstraint = m.stage === constraint?.stage;
                const overSla = m.medianDaysInStage > m.slaDays;
                return (
                  <tr
                    key={m.stage}
                    className="border-b last:border-0 hairline"
                    style={isConstraint ? { background: 'var(--bad-bg)' } : undefined}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium whitespace-nowrap">{m.meta.label}</span>
                        {isConstraint ? <Badge tone="bad">constraint</Badge> : null}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={m.meta.owner === 'client' ? 'warn' : 'neutral'}>
                        {m.meta.owner}
                      </Badge>
                    </Td>
                    <Td align="right" className="tnum font-medium">{m.wip}</Td>
                    <Td align="right" className="tnum">
                      <span style={overSla ? { color: 'var(--bad)' } : undefined}>
                        {fmtDays(m.medianDaysInStage)}
                      </span>
                    </Td>
                    <Td align="right" className="tnum" >
                      <span style={{ color: 'var(--text-muted)' }}>{fmtDays(m.p90DaysInStage)}</span>
                    </Td>
                    <Td align="right" className="tnum" >
                      <span style={{ color: 'var(--text-faint)' }}>{m.slaDays}d</span>
                    </Td>
                    <Td align="right" className="tnum">
                      {m.slaBreaches > 0 ? (
                        <span style={{ color: 'var(--bad)' }}>{m.slaBreaches}</span>
                      ) : (
                        <span style={{ color: 'var(--text-faint)' }}>—</span>
                      )}
                    </Td>
                    <Td align="right" className="tnum">
                      <span style={{ color: 'var(--text-muted)' }}>
                        {m.arrivalsPerWeek.toFixed(1)}
                      </span>
                    </Td>
                    <Td align="right" className="tnum">
                      <span style={{ color: 'var(--text-muted)' }}>
                        {m.throughputPerWeek.toFixed(1)}
                      </span>
                    </Td>
                    <Td align="right" className="tnum font-medium">
                      <span
                        style={
                          m.queueWeeks === null || m.queueWeeks > 2
                            ? { color: 'var(--bad)' }
                            : undefined
                        }
                      >
                        {fmtWeeks(m.queueWeeks)}
                      </span>
                    </Td>
                    <Td>
                      <Meter
                        value={m.wip}
                        max={maxWip}
                        tone={isConstraint ? 'bad' : m.meta.owner === 'client' ? 'warn' : 'info'}
                        label={`${m.wip} returns in ${m.meta.label}`}
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---- Stalled ----------------------------------------------------- */}
        <Card>
          <CardHeader
            title="Oldest stalls"
            subtitle={`${a.stalled.length} returns are past their stage target`}
            action={
              <Link href="/pipeline?filter=stalled" className="text-xs font-medium no-underline" style={{ color: 'var(--info)' }}>
                See all →
              </Link>
            }
          />
          {a.stalled.length === 0 ? (
            <EmptyState>Nothing is past its stage target.</EmptyState>
          ) : (
            <ul>
              {a.stalled.slice(0, 8).map((s) => (
                <li key={s.ret.id} className="border-b p-3 last:border-0 hairline">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/returns/${s.ret.id}`}
                        className="truncate text-sm font-medium no-underline hover:underline"
                      >
                        {a.clientById.get(s.ret.clientId)?.name ?? s.ret.clientId}
                      </Link>
                      <div className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {s.meta.label} · {s.ownerName} · {s.ret.entityType}
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="tnum text-sm font-semibold" style={{ color: 'var(--bad)' }}>
                        {fmtDays(s.daysInStage)}
                      </div>
                      <div className="tnum text-xs" style={{ color: 'var(--text-faint)' }}>
                        +{fmtDays(s.daysOverSla)} over
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---- Rework ------------------------------------------------------- */}
        <Card>
          <CardHeader
            title="Review kickbacks"
            subtitle="Every kickback costs the preparer's time, the reviewer's time twice, and another full trip through the review queue."
          />
          <div className="grid grid-cols-3 gap-px" style={{ background: 'var(--border)' }}>
            <Metric label="Kickback rate" value={`${Math.round(a.rework.rate * 100)}%`} tone={a.rework.rate > 0.25 ? 'bad' : 'neutral'} hint="of completed reviews" />
            <Metric label="Kickbacks" value={`${a.rework.totalKickbacks}`} hint="last 28 days" />
            <Metric label="Reviews" value={`${a.rework.reviewsCompleted}`} hint="last 28 days" />
          </div>
          {a.rework.byPreparer.filter((p) => p.prepared > 0).length === 0 ? (
            <EmptyState>No completed prep work in the window.</EmptyState>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b hairline">
                  <Th>Preparer</Th>
                  <Th align="right">Prepared</Th>
                  <Th align="right">Kicked back</Th>
                  <Th align="right">Rate</Th>
                </tr>
              </thead>
              <tbody>
                {a.rework.byPreparer
                  .filter((p) => p.prepared > 0)
                  .map((p) => (
                    <tr key={p.staff.id} className="border-b last:border-0 hairline">
                      <Td className="font-medium">{p.staff.name}</Td>
                      <Td align="right" className="tnum">{p.prepared}</Td>
                      <Td align="right" className="tnum">{p.kickbacks}</Td>
                      <Td align="right" className="tnum font-medium">
                        <span style={p.rate > 0.25 ? { color: 'var(--bad)' } : undefined}>
                          {Math.round(p.rate * 100)}%
                        </span>
                      </Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* ---- Risk mix ------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Deadline projection"
          subtitle="Each open return is walked through its remaining stages at the firm's measured pace, then compared with its own due date."
          action={
            <Link href="/triage" className="text-xs font-medium no-underline" style={{ color: 'var(--info)' }}>
              Extension triage →
            </Link>
          }
        />
        <div className="p-4">
          <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
            {(['on_track', 'at_risk', 'will_miss'] as const).map((level) => {
              const count =
                level === 'on_track'
                  ? riskSummary.onTrack
                  : level === 'at_risk'
                    ? riskSummary.atRisk
                    : riskSummary.willMiss;
              const total = riskSummary.onTrack + riskSummary.atRisk + riskSummary.willMiss;
              if (total === 0 || count === 0) return null;
              return (
                <div
                  key={level}
                  style={{
                    width: `${(count / total) * 100}%`,
                    background: `var(--${RISK_TONE[level]})`,
                  }}
                  title={`${count} ${level}`}
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <Legend tone="ok" label="On track" value={riskSummary.onTrack} />
            <Legend tone="warn" label="At risk" value={riskSummary.atRisk} />
            <Legend tone="bad" label="Will miss" value={riskSummary.willMiss} />
          </div>
        </div>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'warn' | 'bad' | 'neutral';
}) {
  const color =
    tone === 'neutral' ? 'var(--text)' : `var(--${tone})`;
  return (
    <div className="p-4" style={{ background: 'var(--surface)' }}>
      <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="tnum mt-1 text-xl font-semibold tracking-tight" style={{ color }}>
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-xs leading-snug" style={{ color: 'var(--text-faint)' }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function Legend({ tone, label, value }: { tone: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: `var(--${tone})` }} />
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="tnum font-semibold">{value}</span>
    </span>
  );
}
