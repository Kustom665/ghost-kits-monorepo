import Link from 'next/link';
import { assessAll, rankAccountHealth, type HealthBand } from '@agency/core';
import { Badge, Panel, PanelHeader, Reasons, Stat, TierBadge, type Tone } from '@/components/ui.tsx';
import { loadSnapshot } from '@/db/queries.ts';
import { money, percent, workingHours } from '@/lib/format.ts';

// Every figure on this page is measured against the current clock, so the page
// is rendered per request rather than frozen into the build.
export const dynamic = 'force-dynamic';

const BAND_TONE: Record<HealthBand, Tone> = { solid: 'ok', watch: 'warn', at_risk: 'bad' };
const BAND_LABEL: Record<HealthBand, string> = { solid: 'Solid', watch: 'Watch', at_risk: 'At risk' };

export default async function AccountsPage() {
  const snapshot = loadSnapshot();
  const sla = assessAll(snapshot.conversations, snapshot.accounts, snapshot.now);
  const ranked = rankAccountHealth(
    snapshot.accounts,
    snapshot.conversations,
    snapshot.deals,
    sla,
    snapshot.now,
  );

  const clients = ranked.filter((h) => h.account.tier !== 'prospect');
  const prospects = ranked.filter((h) => h.account.tier === 'prospect');

  const recurring = clients.reduce((sum, h) => sum + h.account.retainerMonthly, 0);
  const atRisk = clients.filter((h) => h.band === 'at_risk');
  const atRiskValue = atRisk.reduce((sum, h) => sum + h.account.retainerMonthly, 0);
  const renewing = clients.filter((h) => h.daysToRenewal !== null && h.daysToRenewal <= 60 && h.daysToRenewal >= 0);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Health is read off behaviour — response debt, how long the account has been quiet, and how
          close the renewal is — rather than typed into a dropdown by whoever last spoke to them.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Recurring revenue" value={`${money(recurring, true)}/mo`} hint={`${clients.length} retained accounts`} />
        <Stat
          label="At risk"
          value={`${money(atRiskValue, true)}/mo`}
          tone={atRiskValue > 0 ? 'bad' : 'ok'}
          hint={`${atRisk.length} account${atRisk.length === 1 ? '' : 's'} scoring below 45`}
        />
        <Stat
          label="Renewing in 60 days"
          value={renewing.length}
          tone={renewing.length > 0 ? 'warn' : 'neutral'}
          hint={renewing.length > 0 ? money(renewing.reduce((s, h) => s + h.account.retainerMonthly, 0), true) + '/mo up' : 'nothing imminent'}
        />
        <Stat label="Prospects" value={prospects.length} hint="not yet clients" />
      </div>

      <Panel>
        <PanelHeader title="Clients" subtitle="Worst health first — this is a work list, not a leaderboard" />
        <div className="flex flex-col">
          {clients.map((health) => (
            <Link
              key={health.account.id}
              href={`/accounts/${health.account.id}`}
              className="row-link flex flex-col gap-2 border-b p-4 last:border-b-0 hairline lg:flex-row lg:items-center lg:gap-4"
            >
              <div className="min-w-0 lg:w-64">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{health.account.name}</span>
                  <TierBadge tier={health.account.tier} />
                </div>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--text-faint)' }}>
                  {health.account.industry} · {money(health.account.retainerMonthly, true)}/mo
                </div>
              </div>

              <div className="flex items-center gap-2 lg:w-28">
                <span
                  className="tnum text-xl font-semibold"
                  style={{ color: `var(--${health.band === 'at_risk' ? 'bad' : health.band === 'watch' ? 'warn' : 'ok'})` }}
                >
                  {health.score}
                </span>
                <Badge tone={BAND_TONE[health.band]}>{BAND_LABEL[health.band]}</Badge>
              </div>

              <div className="min-w-0 flex-1">
                {health.reasons.length > 0 ? (
                  <Reasons items={health.reasons} limit={2} />
                ) : (
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                    Answered on time, engaged, nothing overdue.
                  </span>
                )}
              </div>

              <div className="tnum flex shrink-0 gap-4 text-xs lg:w-64 lg:justify-end">
                <div className="text-right">
                  <div style={{ color: health.breachedThreads > 0 ? 'var(--bad)' : 'var(--text-muted)' }}>
                    {health.owedThreads}
                  </div>
                  <div style={{ color: 'var(--text-faint)' }}>owed</div>
                </div>
                <div className="text-right">
                  <div style={{ color: 'var(--text-muted)' }}>{Math.round(health.quietDays)}d</div>
                  <div style={{ color: 'var(--text-faint)' }}>quiet</div>
                </div>
                <div className="text-right">
                  {/* A rate off one or two threads is noise; show the dash and
                      let the reader look at the sample instead. */}
                  <div style={{ color: 'var(--text-muted)' }}>
                    {health.answeredSample >= 3 ? percent(health.onTimeRate) : '—'}
                  </div>
                  <div style={{ color: 'var(--text-faint)' }}>on time</div>
                </div>
                <div className="text-right">
                  <div style={{ color: health.daysToRenewal !== null && health.daysToRenewal <= 30 ? 'var(--warn)' : 'var(--text-muted)' }}>
                    {health.daysToRenewal === null ? '—' : `${health.daysToRenewal}d`}
                  </div>
                  <div style={{ color: 'var(--text-faint)' }}>renewal</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Prospects"
          subtitle="First-response budget is one hour — contact rates fall off a cliff after that"
        />
        <div className="flex flex-col">
          {prospects.map((health) => (
            <Link
              key={health.account.id}
              href={`/accounts/${health.account.id}`}
              className="row-link flex flex-wrap items-center gap-x-4 gap-y-2 border-b p-4 last:border-b-0 hairline"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{health.account.name}</div>
                <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  {health.account.industry}
                </div>
              </div>
              {health.openDealValue > 0 ? (
                <Badge tone="accent">{money(health.openDealValue, true)} open</Badge>
              ) : null}
              {health.owedThreads > 0 ? (
                <Badge tone={health.breachedThreads > 0 ? 'bad' : 'warn'}>
                  {health.owedThreads} owed
                  {health.worstOwedHours > 0 ? ` · ${workingHours(health.worstOwedHours)}` : ''}
                </Badge>
              ) : (
                <Badge tone="ok">Nothing owed</Badge>
              )}
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
