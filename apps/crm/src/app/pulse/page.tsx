import Link from 'next/link';
import {
  assessAll,
  buildTeamLoad,
  buildTriage,
  findStalledDeals,
  firstResponseSample,
  forecast,
  inFolder,
  median,
  percentile,
  rankAccountHealth,
  summarizeSla,
} from '@agency/core';
import { reseedAction } from '@/app/actions.ts';
import { Avatar, Badge, Empty, Meter, Panel, PanelHeader, Reasons, Stat, TierBadge } from '@/components/ui.tsx';
import { getViewerId, loadSnapshot } from '@/db/queries.ts';
import { money, percent, workingHours } from '@/lib/format.ts';

// Every figure on this page is measured against the current clock, so the page
// is rendered per request rather than frozen into the build.
export const dynamic = 'force-dynamic';

export default async function PulsePage() {
  const snapshot = loadSnapshot();
  const viewerId = getViewerId();

  const sla = assessAll(snapshot.conversations, snapshot.accounts, snapshot.now);
  const ranked = buildTriage(
    snapshot.conversations,
    snapshot.accounts,
    snapshot.contacts,
    snapshot.deals,
    snapshot.now,
  );
  const open = ranked.filter((item) => inFolder(item.conversation, 'inbox', snapshot.now, viewerId));
  const summary = summarizeSla(open.map((item) => item.sla));

  // Revenue actually sitting behind a late reply. Counted once per account —
  // three late threads at one client is one relationship at risk, not three.
  const breachedAccounts = new Map<string, { name: string; retainer: number; threads: number; tier: string }>();
  for (const item of open) {
    if (item.sla.status !== 'breached') continue;
    const existing = breachedAccounts.get(item.account.id);
    if (existing) existing.threads += 1;
    else
      breachedAccounts.set(item.account.id, {
        name: item.account.name,
        retainer: item.account.retainerMonthly,
        threads: 1,
        tier: item.account.tier,
      });
  }
  const exposedRevenue = [...breachedAccounts.values()].reduce((sum, a) => sum + a.retainer, 0);

  const sample = firstResponseSample(snapshot.conversations, snapshot.now, 30);
  const medianFirst = median(sample);
  const p90First = percentile(sample, 90);

  const load = buildTeamLoad(snapshot.team, snapshot.conversations, sla, snapshot.now);
  const maxLoad = Math.max(1, ...load.map((entry) => entry.openThreads));
  const worstOwner = load.find((entry) => entry.breachedThreads > 0) ?? null;

  const health = rankAccountHealth(
    snapshot.accounts,
    snapshot.conversations,
    snapshot.deals,
    sla,
    snapshot.now,
  ).filter((h) => h.account.tier !== 'prospect');

  const stalled = findStalledDeals(snapshot.deals, snapshot.dealEvents, snapshot.now);
  const outlook = forecast(snapshot.deals, snapshot.dealEvents, snapshot.now, 60);
  const unowned = open.filter((item) => item.conversation.assigneeId === null && item.sla.status !== 'not_owed');

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Pulse</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          The state of the shop in working hours — what is late, who is carrying it, and what it is
          costing.
        </p>
      </header>

      {/* The headline. One sentence, no chart, because this is the number that
          decides what someone does in the next ten minutes. */}
      <Panel className="overflow-hidden">
        <div className="p-5" style={{ background: summary.breached > 0 ? 'var(--grad-hot)' : 'var(--grad-cool)' }}>
          <div className="text-xs font-semibold tracking-wider text-white/70 uppercase">Right now</div>
          <p className="mt-2 max-w-3xl text-lg leading-snug font-semibold text-white">
            {summary.breached === 0 ? (
              <>Every open thread is inside its response target.</>
            ) : (
              <>
                {summary.breached} thread{summary.breached === 1 ? ' is' : 's are'} past target across{' '}
                {breachedAccounts.size} account{breachedAccounts.size === 1 ? '' : 's'}, holding{' '}
                {money(exposedRevenue, true)}/mo of retained revenue behind a late reply.
                {worstOwner
                  ? ` ${worstOwner.member.name.split(' ')[0]} is carrying ${worstOwner.breachedThreads} of them.`
                  : ''}
              </>
            )}
          </p>
          <p className="mt-2 text-sm text-white/75">
            {unowned.length > 0
              ? `${unowned.length} of the owed threads have no owner at all — the cheapest fix on this page.`
              : 'Every owed thread has an owner.'}
          </p>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Owed a reply" value={summary.owed} tone={summary.owed > 0 ? 'accent' : 'ok'} hint={`median wait ${workingHours(summary.medianOwedHours)}`} />
        <Stat label="Past target" value={summary.breached} tone={summary.breached > 0 ? 'bad' : 'ok'} hint={`worst ${workingHours(summary.worstOwedHours)}`} />
        <Stat
          label="First response (median)"
          value={workingHours(medianFirst)}
          hint={`p90 ${workingHours(p90First)} · ${sample.length} threads, 30 days`}
        />
        <Stat
          label="Weighted pipeline"
          value={money(outlook.weightedValue, true)}
          tone="accent"
          hint={`${outlook.inWindow} deals inside 60 days`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Where the queue actually sits"
            subtitle="A shop-wide breach count usually resolves to one or two people underwater"
          />
          <div className="flex flex-col">
            {load.map((entry) => (
              <div key={entry.member.id} className="flex items-center gap-3 border-b p-3 last:border-b-0 hairline">
                <Avatar name={entry.member.name} id={entry.member.id} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{entry.member.name}</span>
                    {entry.breachedThreads > 0 ? <Badge tone="bad">{entry.breachedThreads} late</Badge> : null}
                  </div>
                  <div className="mt-1.5">
                    <Meter
                      value={entry.openThreads}
                      max={maxLoad}
                      tone={entry.breachedThreads > 0 ? 'bad' : 'accent'}
                      label={`${entry.openThreads} open threads`}
                    />
                  </div>
                </div>
                <div className="tnum shrink-0 text-right text-xs" style={{ color: 'var(--text-faint)' }}>
                  <div style={{ color: 'var(--text-muted)' }}>{entry.openThreads} open</div>
                  <div>
                    {entry.owedThreads} owed
                    {entry.oldestOwedHours > 0 ? ` · ${workingHours(entry.oldestOwedHours)}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Accounts to call" subtitle="Lowest health first" />
          <div className="flex flex-col">
            {health.slice(0, 6).map((entry) => (
              <Link
                key={entry.account.id}
                href={`/accounts/${entry.account.id}`}
                className="row-link border-b p-3 last:border-b-0 hairline"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.account.name}</span>
                  <TierBadge tier={entry.account.tier} />
                  <span
                    className="tnum text-sm font-semibold"
                    style={{
                      color:
                        entry.band === 'at_risk' ? 'var(--bad)' : entry.band === 'watch' ? 'var(--warn)' : 'var(--ok)',
                    }}
                  >
                    {entry.score}
                  </span>
                </div>
                <Reasons items={entry.reasons} limit={2} />
              </Link>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Unowned and waiting" subtitle="Nobody has picked these up" />
          <div className="flex flex-col">
            {unowned.length === 0 ? (
              <Empty>Everything owed has an owner.</Empty>
            ) : (
              unowned.slice(0, 6).map((item) => (
                <Link
                  key={item.conversation.id}
                  href={`/conversations/${item.conversation.id}`}
                  className="row-link flex items-center gap-3 border-b p-3 last:border-b-0 hairline"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.conversation.subject}</div>
                    <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
                      {item.account.name}
                    </div>
                  </div>
                  <Badge tone={item.sla.status === 'breached' ? 'bad' : 'warn'}>
                    {workingHours(item.sla.owedHours)} waiting
                  </Badge>
                </Link>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Deals going cold" subtitle="Past the slow quartile for their stage" />
          <div className="flex flex-col">
            {stalled.length === 0 ? (
              <Empty>Nothing is stuck.</Empty>
            ) : (
              stalled.slice(0, 6).map((entry) => (
                <div key={entry.deal.id} className="flex items-center gap-3 border-b p-3 last:border-b-0 hairline">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{entry.deal.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
                      {entry.daysInStage} working days in {entry.deal.stage} · usual limit {entry.threshold}
                    </div>
                  </div>
                  <span className="tnum text-sm font-semibold">{money(entry.deal.value, true)}</span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="How these numbers are built"
          subtitle="So nobody has to take the dashboard on faith"
          action={
            <form action={reseedAction}>
              <button type="submit" className="btn">
                Regenerate demo data
              </button>
            </form>
          }
        />
        <div className="grid gap-4 p-4 text-xs leading-relaxed sm:grid-cols-2" style={{ color: 'var(--text-muted)' }}>
          <p>
            <strong style={{ color: 'var(--text)' }}>Working hours only.</strong> A message that lands
            at 6pm Friday and is answered at 9:30 Monday was answered in half an hour, not sixty-three.
            Every clock on this page pauses overnight and at the weekend.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Only threads we owe.</strong> A thread waiting on
            the client accrues nothing. Counting it as slow is how response dashboards stop meaning
            anything.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Two budgets, not one.</strong> First reply and
            follow-up are measured separately, and the budget depends on the tier — a prospect gets one
            hour because inbound contact rates collapse after that.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Measured, not assumed.</strong> Stage win rates
            and dwell thresholds come from this shop&rsquo;s own closed deals, falling back to defaults
            only while the sample is too thin to trust.
          </p>
        </div>
      </Panel>
    </div>
  );
}
