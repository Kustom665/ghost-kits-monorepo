import Link from 'next/link';
import {
  ALL_STAGES,
  STAGE_META,
  buildBoard,
  businessDaysBetween,
  findStalledDeals,
  forecast,
  measureStageProbabilities,
  summarizePipeline,
} from '@agency/core';
import { moveDealStageAction } from '@/app/actions.ts';
import { Badge, Empty, Panel, PanelHeader, Stat } from '@/components/ui.tsx';
import { loadSnapshot } from '@/db/queries.ts';
import { money, percent, shortDate } from '@/lib/format.ts';

// Every figure on this page is measured against the current clock, so the page
// is rendered per request rather than frozen into the build.
export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const snapshot = loadSnapshot();
  const accountById = new Map(snapshot.accounts.map((a) => [a.id, a]));

  const board = buildBoard(snapshot.deals, snapshot.dealEvents, snapshot.now);
  const summary = summarizePipeline(snapshot.deals, snapshot.dealEvents, snapshot.now);
  const outlook = forecast(snapshot.deals, snapshot.dealEvents, snapshot.now, 60);
  const stalled = findStalledDeals(snapshot.deals, snapshot.dealEvents, snapshot.now);
  const stalledIds = new Set(stalled.map((s) => s.deal.id));
  const probabilities = measureStageProbabilities(snapshot.deals, snapshot.dealEvents);
  const measuredCount = probabilities.filter((p) => p.measured).length;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Weighted with this shop&rsquo;s own measured win rate per stage, not a vendor&rsquo;s default
          percentages.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open pipeline" value={money(summary.openValue, true)} hint={`${summary.openDeals} live deals`} />
        <Stat
          label="Weighted"
          value={money(summary.weightedValue, true)}
          tone="accent"
          hint="value × measured stage win rate"
        />
        <Stat
          label="Win rate"
          value={percent(summary.winRate)}
          hint={`${summary.closedSample} deals closed in 180 days`}
        />
        <Stat
          label="Median cycle"
          value={`${summary.medianCycleDays}d`}
          hint="working days, open to won"
        />
      </div>

      <Panel>
        <PanelHeader
          title="Next 60 days"
          subtitle={`${outlook.inWindow} deals expected to close in the window`}
        />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Weighted to land
            </div>
            <div className="tnum mt-1 text-2xl font-semibold" style={{ color: 'var(--accent-soft)' }}>
              {money(outlook.weightedValue, true)}
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>
              of {money(outlook.grossValue, true)} gross
            </div>
          </div>
          <div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              New recurring revenue
            </div>
            <div className="tnum mt-1 text-2xl font-semibold">
              {money(outlook.weightedRetainerMonthly, true)}
              <span className="text-sm font-normal" style={{ color: 'var(--text-faint)' }}>
                /mo
              </span>
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>
              weighted retainer portion
            </div>
          </div>
          <div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Past their close date
            </div>
            <div
              className="tnum mt-1 text-2xl font-semibold"
              style={{ color: outlook.slipped > 0 ? 'var(--warn)' : 'var(--ok)' }}
            >
              {outlook.slipped}
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>
              {outlook.slipped > 0 ? `${money(outlook.slippedValue, true)} still forecast` : 'nothing overdue'}
            </div>
          </div>
        </div>
      </Panel>

      <div className="scroll-x -mx-1 px-1 pb-2">
        <div className="grid min-w-[900px] grid-cols-4 gap-3">
          {board.map((column) => {
            const probability = probabilities.find((p) => p.stage === column.stage);
            return (
              <section key={column.stage} className="panel flex min-w-0 flex-col">
                <div className="border-b p-3 hairline">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">{STAGE_META[column.stage].label}</h2>
                    <span className="tnum text-xs" style={{ color: 'var(--text-faint)' }}>
                      {column.count}
                    </span>
                  </div>
                  <div className="tnum mt-1 text-sm font-semibold">{money(column.value, true)}</div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    {money(column.weightedValue, true)} weighted at {percent(column.probability)}
                    {probability?.measured ? '' : ' (default)'}
                  </div>
                </div>

                <div className="flex flex-col gap-2 p-2">
                  {column.deals.length === 0 ? (
                    <Empty>Empty</Empty>
                  ) : (
                    column.deals.map((deal) => {
                      const account = accountById.get(deal.accountId);
                      const daysInStage = Math.round(
                        businessDaysBetween(deal.stageEnteredAt, snapshot.now),
                      );
                      const isStalled = stalledIds.has(deal.id);
                      const overdue = deal.expectedCloseAt < snapshot.now;
                      return (
                        <article key={deal.id} className="panel-2 p-3">
                          <div className="text-xs font-semibold">{deal.name}</div>
                          {account ? (
                            <Link
                              href={`/accounts/${account.id}`}
                              className="mt-0.5 block truncate text-[11px]"
                              style={{ color: 'var(--text-faint)' }}
                            >
                              {account.name}
                            </Link>
                          ) : null}

                          <div className="tnum mt-2 text-sm font-semibold">{money(deal.value, true)}</div>
                          {deal.retainerMonthly > 0 ? (
                            <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                              incl. {money(deal.retainerMonthly, true)}/mo
                            </div>
                          ) : null}

                          <div className="mt-2 flex flex-wrap gap-1">
                            {isStalled ? <Badge tone="warn">{daysInStage}d in stage</Badge> : null}
                            <Badge tone={overdue ? 'bad' : 'neutral'}>
                              {overdue ? 'past close' : shortDate(deal.expectedCloseAt)}
                            </Badge>
                          </div>

                          <form action={moveDealStageAction} className="mt-2 flex gap-1">
                            <input type="hidden" name="dealId" value={deal.id} />
                            <select
                              name="toStage"
                              defaultValue={deal.stage}
                              className="field px-2 py-1 text-[11px]"
                              aria-label={`Move ${deal.name}`}
                            >
                              {ALL_STAGES.map((stage) => (
                                <option key={stage} value={stage}>
                                  {STAGE_META[stage].label}
                                </option>
                              ))}
                            </select>
                            <button type="submit" className="btn px-2 py-1 text-[11px]">
                              Move
                            </button>
                          </form>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <Panel>
        <PanelHeader
          title="Sitting too long"
          subtitle="Deals past the slow quartile of how long this shop's own deals take to clear that stage"
        />
        <div className="flex flex-col">
          {stalled.length === 0 ? (
            <Empty>Nothing is stuck.</Empty>
          ) : (
            stalled.slice(0, 8).map((entry) => {
              const account = accountById.get(entry.deal.accountId);
              return (
                <div
                  key={entry.deal.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b p-3 text-sm last:border-b-0 hairline"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{entry.deal.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
                      {account?.name} · {STAGE_META[entry.deal.stage].label}
                    </div>
                  </div>
                  <div className="tnum text-right text-xs" style={{ color: 'var(--text-muted)' }}>
                    <div>
                      {entry.daysInStage} working days in stage
                    </div>
                    <div style={{ color: 'var(--text-faint)' }}>usual limit {entry.threshold}</div>
                  </div>
                  <div className="tnum w-20 text-right font-semibold">{money(entry.deal.value, true)}</div>
                </div>
              );
            })
          )}
        </div>
      </Panel>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-faint)' }}>
        {measuredCount} of {probabilities.length} stages have enough closed history to use a measured
        win rate; the rest fall back to a default until they do. Stage dwell times count completed
        passes only — a deal that entered negotiation this morning is not a zero-day negotiation.
      </p>
    </div>
  );
}
