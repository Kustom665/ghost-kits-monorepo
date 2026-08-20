import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  STAGE_META,
  assessAccountHealth,
  assessAll,
  buildTriage,
  isOpenStage,
} from '#core';
import { ConversationRow } from '@/components/conversation-row.tsx';
import { Avatar, Badge, Empty, Panel, PanelHeader, Reasons, Stat, TierBadge } from '@/components/ui.tsx';
import { getAccount, getSnippets, loadSnapshot } from '@/db/queries.ts';
import { money, percent, shortDate, workingHours } from '@/lib/format.ts';

// Every figure on this page is measured against the current clock, so the page
// is rendered per request rather than frozen into the build.
export const dynamic = 'force-dynamic';

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = getAccount(id);
  if (!account) notFound();

  const snapshot = loadSnapshot();
  const snippets = getSnippets();
  const teamById = new Map(snapshot.team.map((m) => [m.id, m]));
  const owner = account.ownerId ? teamById.get(account.ownerId) : undefined;

  const sla = assessAll(snapshot.conversations, snapshot.accounts, snapshot.now);
  const health = assessAccountHealth(account, snapshot.conversations, snapshot.deals, sla, snapshot.now);

  const ranked = buildTriage(
    snapshot.conversations.filter((c) => c.accountId === account.id),
    snapshot.accounts,
    snapshot.contacts,
    snapshot.deals,
    snapshot.now,
  );
  const open = ranked.filter((item) => item.conversation.state !== 'closed');
  const closed = ranked
    .filter((item) => item.conversation.state === 'closed')
    .sort((a, b) => b.conversation.lastMessageAt.localeCompare(a.conversation.lastMessageAt));

  const contacts = snapshot.contacts.filter((c) => c.accountId === account.id);
  const deals = snapshot.deals
    .filter((d) => d.accountId === account.id)
    .sort((a, b) => Number(isOpenStage(b.stage)) - Number(isOpenStage(a.stage)) || b.value - a.value);

  const bandColor =
    health.band === 'at_risk' ? 'var(--bad)' : health.band === 'watch' ? 'var(--warn)' : 'var(--ok)';

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <Link href="/accounts" className="text-xs" style={{ color: 'var(--text-faint)' }}>
          ← All accounts
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
              <TierBadge tier={account.tier} />
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {account.industry}
              {account.retainerMonthly > 0 ? ` · ${money(account.retainerMonthly)}/mo` : ' · no retainer'}
              {owner ? ` · owned by ${owner.name}` : ''}
              {account.renewsAt ? ` · renews ${shortDate(account.renewsAt)}` : ''}
            </p>
          </div>
          <div className="text-right">
            <div className="tnum text-3xl font-semibold" style={{ color: bandColor }}>
              {health.score}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
              health score
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Owed a reply"
          value={health.owedThreads}
          tone={health.breachedThreads > 0 ? 'bad' : health.owedThreads > 0 ? 'warn' : 'ok'}
          hint={health.worstOwedHours > 0 ? `worst ${workingHours(health.worstOwedHours)}` : 'nothing outstanding'}
        />
        <Stat
          label="First replies on time"
          value={health.answeredSample >= 3 ? percent(health.onTimeRate) : '—'}
          hint={`${health.answeredSample} threads measured`}
        />
        <Stat
          label="Quiet for"
          value={`${Math.round(health.quietDays)}d`}
          hint="working days since they last wrote"
        />
        <Stat
          label="Open expansion"
          value={money(health.openDealValue, true)}
          tone={health.openDealValue > 0 ? 'accent' : 'neutral'}
          hint={`${deals.filter((d) => isOpenStage(d.stage)).length} live deals`}
        />
      </div>

      {health.reasons.length > 0 ? (
        <Panel>
          <PanelHeader title="What the score is reading" />
          <div className="p-4 pt-3">
            <Reasons items={health.reasons} limit={6} />
          </div>
        </Panel>
      ) : null}

      <div className="flex flex-col gap-5 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Open threads</h2>
            <div className="flex flex-col gap-2.5">
              {open.length === 0 ? (
                <Panel>
                  <Empty>No open threads.</Empty>
                </Panel>
              ) : (
                open.map((item) => (
                  <ConversationRow
                    key={item.conversation.id}
                    item={item}
                    snippet={snippets.get(item.conversation.id)}
                    assignee={
                      item.conversation.assigneeId ? teamById.get(item.conversation.assigneeId) : undefined
                    }
                    now={snapshot.now}
                  />
                ))
              )}
            </div>
          </div>

          <Panel>
            <PanelHeader title="Recently closed" subtitle={`${closed.length} resolved threads`} />
            <div className="flex flex-col">
              {closed.slice(0, 8).map((item) => (
                <Link
                  key={item.conversation.id}
                  href={`/conversations/${item.conversation.id}`}
                  className="row-link flex items-center gap-3 border-b p-3 text-sm last:border-b-0 hairline"
                >
                  <span className="min-w-0 flex-1 truncate">{item.conversation.subject}</span>
                  <span className="shrink-0 text-xs" style={{ color: 'var(--text-faint)' }}>
                    {shortDate(item.conversation.lastMessageAt)}
                  </span>
                </Link>
              ))}
              {closed.length === 0 ? <Empty>Nothing closed yet.</Empty> : null}
            </div>
          </Panel>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
          <Panel>
            <PanelHeader title="Deals" />
            <div className="flex flex-col">
              {deals.length === 0 ? (
                <Empty>No deals recorded.</Empty>
              ) : (
                deals.map((deal) => (
                  <div key={deal.id} className="border-b p-3 last:border-b-0 hairline">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-xs font-semibold">{deal.name}</span>
                      <span className="tnum shrink-0 text-xs font-semibold">{money(deal.value, true)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={deal.stage === 'won' ? 'ok' : deal.stage === 'lost' ? 'neutral' : 'accent'}>
                        {STAGE_META[deal.stage].label}
                      </Badge>
                      <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        {isOpenStage(deal.stage)
                          ? `closes ${shortDate(deal.expectedCloseAt)}`
                          : deal.lostReason || `closed ${shortDate(deal.closedAt ?? deal.expectedCloseAt)}`}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Contacts" />
            <div className="flex flex-col">
              {contacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-3 border-b p-3 last:border-b-0 hairline">
                  <Avatar name={contact.name} id={contact.id} size={32} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold">{contact.name}</span>
                      {contact.isPrimary ? <Badge tone="accent">Primary</Badge> : null}
                    </div>
                    <div className="truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>
                      {contact.title} · {contact.email}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
