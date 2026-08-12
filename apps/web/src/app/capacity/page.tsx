import Link from 'next/link';
import { getAnalytics } from '@/lib/analytics.ts';
import { Badge, Card, CardHeader, EmptyState, Meter, Td, Th } from '@/components/ui.tsx';
import { fmtHours, fmtRate, fmtWeeks } from '@/lib/format.ts';

export const dynamic = 'force-dynamic';

const ROLE_ORDER = ['reviewer', 'partner', 'preparer', 'admin'] as const;

export default function CapacityPage() {
  const a = getAnalytics();
  const loads = a.staffLoad.filter((l) => l.staff.role !== 'admin' || l.assigned > 0);

  // The person with the deepest queue is usually the real constraint behind a
  // stage-level one, so we call them out explicitly.
  const worst = loads
    .filter((l) => l.assigned > 0)
    .sort((x, y) => (y.queueWeeks ?? Number.POSITIVE_INFINITY) - (x.queueWeeks ?? Number.POSITIVE_INFINITY))[0];

  const maxQueue = Math.max(...loads.map((l) => l.assigned), 1);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Capacity</h1>
        <p className="mt-0.5 max-w-3xl text-sm" style={{ color: 'var(--text-muted)' }}>
          A stage-level bottleneck is usually one or two specific people. Burn-down is each
          person&rsquo;s own queue divided by their own measured clearance rate over the last 28 days.
        </p>
      </div>

      {worst && worst.queueWeeks !== null ? (
        <Card>
          <div className="p-5">
            <Badge tone="bad">Deepest queue</Badge>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              {worst.staff.name} is carrying {worst.queueWeeks.toFixed(1)} weeks of work
            </h2>
            <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--text-muted)' }}>
              {worst.assigned} returns assigned against a clearance rate of{' '}
              {fmtRate(worst.throughputPerWeek)}.{' '}
              {worst.queueWeeks > 3
                ? 'Reassigning even a handful of these to a reviewer with slack shortens the whole pipeline behind them.'
                : 'This is within a workable range, but worth watching as arrivals climb.'}
            </p>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Load by person"
          subtitle="Assigned counts only the stages that person is on the hook for clearing."
        />
        {loads.length === 0 ? (
          <EmptyState>No active staff.</EmptyState>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b hairline">
                  <Th>Person</Th>
                  <Th>Role</Th>
                  <Th align="right">Assigned</Th>
                  <Th align="right">Queued</Th>
                  <Th align="right">Hours</Th>
                  <Th align="right">Clears</Th>
                  <Th align="right">Burn-down</Th>
                  <Th align="right">Kickbacks</Th>
                  <Th className="w-32">Load</Th>
                </tr>
              </thead>
              <tbody>
                {[...loads]
                  .sort((x, y) => {
                    const roleDiff =
                      ROLE_ORDER.indexOf(x.staff.role as (typeof ROLE_ORDER)[number]) -
                      ROLE_ORDER.indexOf(y.staff.role as (typeof ROLE_ORDER)[number]);
                    if (roleDiff !== 0) return roleDiff;
                    return (y.queueWeeks ?? 999) - (x.queueWeeks ?? 999);
                  })
                  .map((l) => {
                    const deep = l.queueWeeks !== null && l.queueWeeks > 3;
                    return (
                      <tr key={l.staff.id} className="border-b last:border-0 hairline">
                        <Td>
                          <Link
                            href={`/pipeline?owner=${l.staff.id}`}
                            className="font-medium no-underline hover:underline"
                          >
                            {l.staff.name}
                          </Link>
                        </Td>
                        <Td>
                          <Badge>{l.staff.role}</Badge>
                        </Td>
                        <Td align="right" className="tnum font-medium">{l.assigned}</Td>
                        <Td align="right" className="tnum">
                          <span style={{ color: 'var(--text-muted)' }}>{l.queued}</span>
                        </Td>
                        <Td align="right" className="tnum">
                          <span style={{ color: 'var(--text-muted)' }}>{fmtHours(l.assignedHours)}</span>
                        </Td>
                        <Td align="right" className="tnum">
                          <span style={{ color: 'var(--text-muted)' }}>{fmtRate(l.throughputPerWeek)}</span>
                        </Td>
                        <Td align="right" className="tnum font-medium">
                          <span style={deep || l.queueWeeks === null ? { color: 'var(--bad)' } : undefined}>
                            {l.assigned === 0 ? '—' : fmtWeeks(l.queueWeeks)}
                          </span>
                        </Td>
                        <Td align="right" className="tnum">
                          {l.staff.role === 'reviewer' && l.reworkRate > 0 ? (
                            <span style={l.reworkRate > 0.25 ? { color: 'var(--warn)' } : undefined}>
                              {Math.round(l.reworkRate * 100)}%
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-faint)' }}>—</span>
                          )}
                        </Td>
                        <Td>
                          <Meter
                            value={l.assigned}
                            max={maxQueue}
                            tone={deep ? 'bad' : 'info'}
                            label={`${l.assigned} returns assigned to ${l.staff.name}`}
                          />
                        </Td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Reading this table"
          subtitle="What each column is actually telling you"
        />
        <dl className="grid gap-4 p-4 sm:grid-cols-2">
          {[
            ['Assigned vs Queued', 'Queued is the subset nobody has started yet. A large gap between the two means work is piling up in front of this person rather than moving through them.'],
            ['Clears', 'Returns per week this person actually moved out of their working stage over the last 28 days — measured, not budgeted.'],
            ['Burn-down', 'How long their current queue takes at their own rate. Anything past three weeks will not recover on its own before a deadline.'],
            ['Kickbacks', 'For reviewers, the share of their reviews sent back to the preparer. A high rate points at a training gap upstream, not at the reviewer.'],
          ].map(([term, def]) => (
            <div key={term}>
              <dt className="text-sm font-semibold">{term}</dt>
              <dd className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>{def}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
