import Link from 'next/link';
import { STAGE_META } from '@taxflow/core';
import { getAnalytics } from '@/lib/analytics.ts';
import { advanceStageAction } from '@/app/actions.ts';
import { Badge, Card, CardHeader, EmptyState, Stat, Td, Th } from '@/components/ui.tsx';
import { fmtDate, fmtHours, fmtMoney } from '@/lib/format.ts';

export const dynamic = 'force-dynamic';

export default function TriagePage() {
  const a = getAnalytics();
  const { triage, riskSummary } = a;

  const hoursFreed = triage.reduce((sum, t) => sum + t.hoursFreed, 0);
  const feesInvolved = triage.reduce((sum, t) => sum + t.risk.ret.priorYearFee, 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Extension triage</h1>
        <p className="mt-0.5 max-w-3xl text-sm" style={{ color: 'var(--text-muted)' }}>
          Filing an extension is not a failure — filing one at the last minute is. These returns are
          projected to miss their date at the firm&rsquo;s current measured pace. Deciding now which
          ones go on extension is what protects the returns that can still make it.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Projected to miss"
          value={riskSummary.willMiss}
          tone={riskSummary.willMiss > 0 ? 'bad' : 'ok'}
          hint="at the current pace, before any intervention"
        />
        <Stat
          label="Already at risk"
          value={riskSummary.atRisk}
          tone="warn"
          hint="under five days of buffer — one surprise from missing"
        />
        <Stat
          label="Capacity freed"
          value={fmtHours(hoursFreed)}
          hint="budgeted hours off the critical path if all are extended"
        />
        <Stat
          label="Fees involved"
          value={fmtMoney(feesInvolved)}
          hint="prior-year fees on these engagements"
        />
      </div>

      <Card>
        <CardHeader
          title={`${triage.length} candidates`}
          subtitle="Worst projected miss first; among similar misses the lower-fee engagement is extended before the larger one."
        />
        {triage.length === 0 ? (
          <EmptyState>
            Nothing is projected to miss its deadline. No extensions needed on current pace.
          </EmptyState>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[940px] text-sm">
              <thead>
                <tr className="border-b hairline">
                  <Th>Client</Th>
                  <Th>Type</Th>
                  <Th>Stage</Th>
                  <Th align="right">Due</Th>
                  <Th align="right">Projected</Th>
                  <Th align="right">Late by</Th>
                  <Th align="right">Fee</Th>
                  <Th>Why</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {triage.map((t) => {
                  const meta = STAGE_META[t.risk.ret.stage];
                  return (
                    <tr key={t.risk.ret.id} className="border-b last:border-0 hairline">
                      <Td>
                        <Link
                          href={`/returns/${t.risk.ret.id}`}
                          className="font-medium no-underline hover:underline"
                        >
                          {a.clientById.get(t.risk.ret.clientId)?.name ?? t.risk.ret.clientId}
                        </Link>
                      </Td>
                      <Td><Badge>{t.risk.ret.entityType}</Badge></Td>
                      <Td>
                        <span className="whitespace-nowrap">{meta.label}</span>
                        {meta.owner === 'client' ? (
                          <div className="text-xs" style={{ color: 'var(--warn)' }}>
                            waiting on client
                          </div>
                        ) : null}
                      </Td>
                      <Td align="right" className="tnum whitespace-nowrap">
                        {fmtDate(t.risk.ret.dueDate)}
                      </Td>
                      <Td align="right" className="tnum whitespace-nowrap">
                        <span style={{ color: 'var(--text-muted)' }}>
                          {fmtDate(t.risk.projectedCompletion)}
                        </span>
                      </Td>
                      <Td align="right" className="tnum font-semibold">
                        <span style={{ color: 'var(--bad)' }}>
                          {Math.abs(Math.round(t.risk.slackDays))}d
                        </span>
                      </Td>
                      <Td align="right" className="tnum">
                        <span style={{ color: 'var(--text-muted)' }}>
                          {fmtMoney(t.risk.ret.priorYearFee)}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {t.rationale}
                        </span>
                      </Td>
                      <Td align="right">
                        <form action={advanceStageAction}>
                          <input type="hidden" name="returnId" value={t.risk.ret.id} />
                          <input type="hidden" name="toStage" value="extended" />
                          <input
                            type="hidden"
                            name="note"
                            value={`Extended from triage: ${t.rationale}`}
                          />
                          <button
                            type="submit"
                            className="rounded-md border px-2.5 py-1 text-xs font-semibold whitespace-nowrap hairline"
                            style={{ color: 'var(--text)' }}
                          >
                            File extension
                          </button>
                        </form>
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
