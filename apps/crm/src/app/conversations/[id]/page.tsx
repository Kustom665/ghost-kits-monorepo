import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  assessAll,
  assessAccountHealth,
  assessSla,
  draftReply,
  owesResponse,
  scoreConversation,
} from '@agency/core';
import {
  assignConversationAction,
  saveDraftAction,
  sendReplyAction,
  setConversationStateAction,
} from '@/app/actions.ts';
import { Avatar, Badge, Empty, Panel, PanelHeader, Reasons, SlaChip, Tag, TierBadge } from '@/components/ui.tsx';
import { getConversation, getMessages, getViewerId, loadSnapshot } from '@/db/queries.ts';
import { dateTime, money, shortDate, timeAgo, workingHours } from '@/lib/format.ts';

// Every figure on this page is measured against the current clock, so the page
// is rendered per request rather than frozen into the build.
export const dynamic = 'force-dynamic';

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) notFound();

  const snapshot = loadSnapshot();
  const viewerId = getViewerId();
  const account = snapshot.accounts.find((a) => a.id === conversation.accountId);
  if (!account) notFound();

  const contact = snapshot.contacts.find((c) => c.id === conversation.contactId) ?? null;
  const deal = conversation.dealId ? (snapshot.deals.find((d) => d.id === conversation.dealId) ?? null) : null;
  const assignee = conversation.assigneeId
    ? (snapshot.team.find((m) => m.id === conversation.assigneeId) ?? null)
    : null;
  const viewer = snapshot.team.find((m) => m.id === viewerId) ?? null;

  const messages = getMessages(id);
  const sent = messages.filter((m) => !m.isDraft);
  const draft = messages.find((m) => m.isDraft) ?? null;

  const sla = assessSla(conversation, account.tier, snapshot.now);
  const triage = scoreConversation(conversation, account, contact, deal, snapshot.now);
  const slaAll = assessAll(snapshot.conversations, snapshot.accounts, snapshot.now);
  const health = assessAccountHealth(account, snapshot.conversations, snapshot.deals, slaAll, snapshot.now);

  const siblings = snapshot.conversations
    .filter((c) => c.accountId === account.id && c.id !== conversation.id && c.state !== 'closed')
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
    .slice(0, 5);

  const suggested = draft?.body ?? draftReply(conversation, contact, viewer, sla, snapshot.now);
  const isSnoozed = conversation.state === 'snoozed' && !!conversation.snoozedUntil && conversation.snoozedUntil > snapshot.now;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <Link href="/" className="text-xs" style={{ color: 'var(--text-faint)' }}>
          ← Back to inbox
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{conversation.subject}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <Link href={`/accounts/${account.id}`} className="font-medium" style={{ color: 'var(--text)' }}>
                {account.name}
              </Link>
              <TierBadge tier={account.tier} />
              {contact ? (
                <span>
                  · {contact.name}, {contact.title}
                </span>
              ) : null}
              <span>· {conversation.channel}</span>
              {conversation.tags.map((tag) => (
                <Tag key={tag} label={tag} />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SlaChip
              status={sla.status}
              owedHours={sla.owedHours}
              remainingHours={sla.remainingHours}
              budgetHours={sla.budgetHours}
            />
            {conversation.waitingOn === 'them' && conversation.state === 'open' ? (
              <Badge tone="neutral">Waiting on client</Badge>
            ) : null}
            {conversation.state === 'closed' ? <Badge tone="ok">Closed</Badge> : null}
            {isSnoozed ? (
              <Badge tone="info">Snoozed to {shortDate(conversation.snoozedUntil as string)}</Badge>
            ) : null}
          </div>
        </div>

        {owesResponse(conversation, snapshot.now) ? (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              background: sla.status === 'breached' ? 'var(--bad-bg)' : 'var(--panel-2)',
              border: '1px solid var(--border)',
            }}
          >
            <span style={{ color: sla.status === 'breached' ? 'var(--bad)' : 'var(--text-muted)' }}>
              {contact?.name.split(' ')[0] ?? 'The client'} has been waiting{' '}
              <strong>{workingHours(sla.owedHours)}</strong> of working time
              {sla.status === 'breached'
                ? ` — ${workingHours(-sla.remainingHours)} past the ${sla.budgetHours}h ${sla.isFirstResponse ? 'first-response' : 'follow-up'} target for a ${account.tier} account.`
                : `, inside the ${sla.budgetHours}h target. Due ${dateTime(sla.dueAt as string)}.`}
            </span>
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-5 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* ---- Thread ---- */}
          <Panel>
            <PanelHeader
              title="Thread"
              subtitle={`${sent.length} message${sent.length === 1 ? '' : 's'} · opened ${shortDate(conversation.openedAt)}`}
            />
            <div className="flex flex-col gap-4 p-4">
              {sent.map((message) => {
                const outbound = message.direction === 'outbound';
                return (
                  <article
                    key={message.id}
                    className={`flex gap-3 ${outbound ? 'flex-row-reverse' : ''}`}
                  >
                    <Avatar
                      name={message.authorName}
                      id={message.authorId ?? conversation.contactId}
                      size={32}
                    />
                    <div className={`min-w-0 max-w-[46rem] ${outbound ? 'text-right' : ''}`}>
                      <div className="mb-1 flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        <span className={outbound ? 'order-2' : ''}>{message.authorName}</span>
                        <span className={outbound ? 'order-1' : ''}>{dateTime(message.sentAt)}</span>
                      </div>
                      <div
                        className="rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
                        style={
                          outbound
                            ? { background: 'var(--grad-cool)', color: '#fff', textAlign: 'left' }
                            : { background: 'var(--panel-2)', border: '1px solid var(--border)' }
                        }
                      >
                        {message.body}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </Panel>

          {/* ---- Composer ---- */}
          <Panel>
            <PanelHeader
              title="Reply"
              subtitle={
                draft
                  ? 'Picking up your saved draft.'
                  : 'Pre-filled with a first draft — it names the thread and the wait, and stops before promising anything you have not decided.'
              }
            />
            <form className="flex flex-col gap-3 p-4">
              <input type="hidden" name="conversationId" value={conversation.id} />
              <textarea
                name="body"
                rows={7}
                defaultValue={suggested}
                className="field font-sans leading-relaxed"
                aria-label="Reply body"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" formAction={sendReplyAction} className="btn btn-primary">
                  Send reply
                </button>
                <button type="submit" formAction={saveDraftAction} className="btn">
                  Save draft
                </button>
                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  Sending records the reply on the thread and stops the response clock.
                </span>
              </div>
            </form>
          </Panel>
        </div>

        {/* ---- Side rail ---- */}
        <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
          <Panel>
            <PanelHeader title="Actions" />
            <div className="flex flex-col gap-4 p-4">
              <form action={assignConversationAction} className="flex flex-col gap-2">
                <input type="hidden" name="conversationId" value={conversation.id} />
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  Owner
                </label>
                <div className="flex gap-2">
                  <select name="assigneeId" defaultValue={conversation.assigneeId ?? ''} className="field">
                    <option value="">Unassigned</option>
                    {snapshot.team.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn">
                    Set
                  </button>
                </div>
              </form>

              <form action={setConversationStateAction} className="flex flex-col gap-2">
                <input type="hidden" name="conversationId" value={conversation.id} />
                <input type="hidden" name="state" value="snoozed" />
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  Snooze — stops the clock until the date
                </label>
                <div className="flex gap-2">
                  <select name="snoozeDays" defaultValue="3" className="field">
                    <option value="1">1 day</option>
                    <option value="3">3 days</option>
                    <option value="7">1 week</option>
                    <option value="14">2 weeks</option>
                  </select>
                  <button type="submit" className="btn">
                    Snooze
                  </button>
                </div>
              </form>

              <form action={setConversationStateAction} className="flex gap-2">
                <input type="hidden" name="conversationId" value={conversation.id} />
                <input type="hidden" name="state" value={conversation.state === 'closed' ? 'open' : 'closed'} />
                <button type="submit" className="btn w-full justify-center">
                  {conversation.state === 'closed' ? 'Reopen thread' : 'Close thread'}
                </button>
              </form>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Why it ranks here" subtitle={`Score ${triage.score}`} />
            <div className="p-4 pt-3">
              {triage.reasons.length > 0 ? (
                <Reasons items={triage.reasons} limit={5} />
              ) : (
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  Nothing is pushing this thread up the queue.
                </p>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Account"
              subtitle={`${account.industry} · ${account.retainerMonthly > 0 ? `${money(account.retainerMonthly)}/mo` : 'no retainer'}`}
              action={
                <Link href={`/accounts/${account.id}`} className="text-xs" style={{ color: 'var(--accent-soft)' }}>
                  Open
                </Link>
              }
            />
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--text-muted)' }}>Health</span>
                <span
                  className="tnum font-semibold"
                  style={{
                    color:
                      health.band === 'at_risk' ? 'var(--bad)' : health.band === 'watch' ? 'var(--warn)' : 'var(--ok)',
                  }}
                >
                  {health.score}
                </span>
              </div>
              <Reasons items={health.reasons} limit={3} />

              {deal ? (
                <div className="panel-2 p-3">
                  <div className="text-xs font-semibold">{deal.name}</div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {money(deal.value)} · {deal.stage} · closes {shortDate(deal.expectedCloseAt)}
                  </div>
                </div>
              ) : null}

              {assignee ? (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <Avatar name={assignee.name} id={assignee.id} size={22} />
                  Owned by {assignee.name}
                </div>
              ) : (
                <Badge tone="warn">Nobody owns this thread</Badge>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Other open threads" subtitle={account.name} />
            <div className="flex flex-col">
              {siblings.length === 0 ? (
                <Empty>No other open threads.</Empty>
              ) : (
                siblings.map((sibling) => (
                  <Link
                    key={sibling.id}
                    href={`/conversations/${sibling.id}`}
                    className="border-b p-3 text-xs last:border-b-0 hairline row-link"
                  >
                    <div className="truncate font-medium">{sibling.subject}</div>
                    <div className="mt-0.5 flex items-center gap-2" style={{ color: 'var(--text-faint)' }}>
                      <span>{timeAgo(sibling.lastMessageAt, snapshot.now)}</span>
                      {sibling.waitingOn === 'us' ? <Badge tone="accent">Owed</Badge> : null}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
