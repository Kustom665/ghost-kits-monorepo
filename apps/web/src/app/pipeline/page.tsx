import Link from 'next/link';
import { STAGE_META, STAGES, type Stage } from '@taxflow/core';
import { getAnalytics } from '@/lib/analytics.ts';
import { Badge, Card, CardHeader, EmptyState, Td, Th } from '@/components/ui.tsx';
import { fmtDate, fmtDays, fmtHours, RISK_LABEL, RISK_TONE } from '@/lib/format.ts';

export const dynamic = 'force-dynamic';

type Filter = 'all' | 'stalled' | 'at_risk' | 'will_miss';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All open' },
  { key: 'stalled', label: 'Past SLA' },
  { key: 'at_risk', label: 'At risk' },
  { key: 'will_miss', label: 'Will miss' },
];

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; stage?: string; owner?: string }>;
}) {
  const params = await searchParams;
  const filter = (FILTERS.find((f) => f.key === params.filter)?.key ?? 'all') as Filter;
  const stageFilter = STAGES.includes(params.stage as Stage) ? (params.stage as Stage) : null;
  const ownerFilter = params.owner ?? null;

  const a = getAnalytics();
  const stalledIds = new Set(a.stalled.map((s) => s.ret.id));
  const riskById = new Map(a.risks.map((r) => [r.ret.id, r]));
  const stalledById = new Map(a.stalled.map((s) => [s.ret.id, s]));

  let rows = a.risks;
  if (filter === 'stalled') rows = rows.filter((r) => stalledIds.has(r.ret.id));
  if (filter === 'at_risk') rows = rows.filter((r) => r.level === 'at_risk');
  if (filter === 'will_miss') rows = rows.filter((r) => r.level === 'will_miss');
  if (stageFilter) rows = rows.filter((r) => r.ret.stage === stageFilter);
  if (ownerFilter) {
    rows = rows.filter(
      (r) =>
        r.ret.preparerId === ownerFilter ||
        r.ret.reviewerId === ownerFilter ||
        r.ret.partnerId === ownerFilter,
    );
  }

  const ownerName = ownerFilter ? a.staffById.get(ownerFilter)?.name : null;

  const buildHref = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { filter, stage: stageFilter, owner: ownerFilter, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== 'all') next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `/pipeline?${qs}` : '/pipeline';
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Pipeline</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>
          Every open return, projected against its own due date. Sorted by least slack first.
        </p>
      </div>

      {/* ---- Filters -------------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <div className="scroll-x -mx-1 flex gap-1.5 px-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={buildHref({ filter: f.key })}
              className="rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap no-underline hairline"
              style={
                f.key === filter
                  ? { background: 'var(--info-bg)', color: 'var(--info)', borderColor: 'var(--info)' }
                  : { color: 'var(--text-muted)' }
              }
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="scroll-x -mx-1 flex gap-1.5 px-1">
          <Link
            href={buildHref({ stage: null })}
            className="rounded-md border px-2.5 py-1 text-xs whitespace-nowrap no-underline hairline"
            style={
              stageFilter === null
                ? { background: 'var(--surface-2)', color: 'var(--text)' }
                : { color: 'var(--text-muted)' }
            }
          >
            Any stage
          </Link>
          {a.stageMetrics
            .filter((m) => m.wip > 0)
            .map((m) => (
              <Link
                key={m.stage}
                href={buildHref({ stage: m.stage })}
                className="rounded-md border px-2.5 py-1 text-xs whitespace-nowrap no-underline hairline"
                style={
                  stageFilter === m.stage
                    ? { background: 'var(--surface-2)', color: 'var(--text)' }
                    : { color: 'var(--text-muted)' }
                }
              >
                {m.meta.label} <span className="tnum">{m.wip}</span>
              </Link>
            ))}
        </div>

        {ownerName ? (
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Filtered to <strong style={{ color: 'var(--text)' }}>{ownerName}</strong> ·{' '}
            <Link href={buildHref({ owner: null })} style={{ color: 'var(--info)' }}>
              clear
            </Link>
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader
          title={`${rows.length} returns`}
          subtitle="Slack is the gap between the projected finish and the due date. Negative slack means the return is projected to file late."
        />
        {rows.length === 0 ? (
          <EmptyState>No returns match these filters.</EmptyState>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b hairline">
                  <Th>Client</Th>
                  <Th>Type</Th>
                  <Th>Stage</Th>
                  <Th align="right">In stage</Th>
                  <Th>Owner</Th>
                  <Th align="right">Due</Th>
                  <Th align="right">Projected</Th>
                  <Th align="right">Slack</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const stalled = stalledById.get(r.ret.id);
                  const meta = STAGE_META[r.ret.stage];
                  const owner =
                    meta.owner === 'client'
                      ? (a.clientById.get(r.ret.clientId)?.name ?? 'Client')
                      : (a.staffById.get(
                          (r.ret.stage === 'review_queue' || r.ret.stage === 'in_review'
                            ? r.ret.reviewerId
                            : r.ret.stage === 'partner_signoff'
                              ? r.ret.partnerId
                              : r.ret.preparerId) ?? '',
                        )?.name ?? 'Unassigned');

                  return (
                    <tr key={r.ret.id} className="border-b last:border-0 hairline">
                      <Td>
                        <Link
                          href={`/returns/${r.ret.id}`}
                          className="font-medium no-underline hover:underline"
                        >
                          {a.clientById.get(r.ret.clientId)?.name ?? r.ret.clientId}
                        </Link>
                        <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
                          {fmtHours(r.ret.estimatedHours)} · {r.ret.complexity}
                        </div>
                      </Td>
                      <Td><Badge>{r.ret.entityType}</Badge></Td>
                      <Td>
                        <span className="whitespace-nowrap">{meta.label}</span>
                      </Td>
                      <Td align="right" className="tnum">
                        <span style={stalled ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>
                          {fmtDays(stalled?.daysInStage ?? daysIn(r.ret.stageEnteredAt, a.snapshot.now))}
                        </span>
                        {stalled ? (
                          <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
                            +{fmtDays(stalled.daysOverSla)}
                          </div>
                        ) : null}
                      </Td>
                      <Td>
                        <span className="whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                          {owner}
                        </span>
                      </Td>
                      <Td align="right" className="tnum whitespace-nowrap">{fmtDate(r.ret.dueDate)}</Td>
                      <Td align="right" className="tnum whitespace-nowrap">
                        <span style={{ color: 'var(--text-muted)' }}>
                          {fmtDate(r.projectedCompletion)}
                        </span>
                      </Td>
                      <Td align="right" className="tnum font-medium">
                        <span style={{ color: r.slackDays < 0 ? 'var(--bad)' : r.slackDays < 5 ? 'var(--warn)' : 'var(--text-muted)' }}>
                          {r.slackDays > 0 ? '+' : ''}
                          {Math.round(r.slackDays)}d
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={RISK_TONE[r.level]}>{RISK_LABEL[r.level]}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function daysIn(fromIso: string, nowIso: string): number {
  return Math.max(0, (new Date(nowIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}
