import Link from 'next/link';
import type { TeamMember, TriageItem } from '@agency/core';
import type { Snippet } from '@/db/queries.ts';
import { timeAgo, workingHours } from '@/lib/format.ts';
import { Avatar, Badge, SlaChip, Tag, TierBadge } from './ui.tsx';

/**
 * One thread in the list.
 *
 * The `hot` treatment is reserved for the single thread the ranking puts first
 * when it is already past its target — the one thing to do next. Spreading it
 * across every late thread would turn the signal back into wallpaper.
 */
export function ConversationRow({
  item,
  snippet,
  assignee,
  now,
  hot = false,
}: {
  item: TriageItem;
  snippet?: Snippet;
  assignee?: TeamMember;
  now: string;
  hot?: boolean;
}) {
  const { conversation, account, contact, sla, deal } = item;
  const muted = hot ? 'muted-on-grad' : '';

  return (
    <Link
      href={`/conversations/${conversation.id}`}
      className={`block p-4 ${hot ? 'card-hot' : 'panel-2 row-link'}`}
    >
      <div className="flex gap-3">
        <Avatar name={contact?.name ?? account.name} id={conversation.contactId} size={40} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{account.name}</span>
            {hot ? null : <TierBadge tier={account.tier} />}
            <span
              className={`ml-auto shrink-0 text-xs ${muted}`}
              style={hot ? undefined : { color: 'var(--text-faint)' }}
              title={new Date(conversation.lastMessageAt).toLocaleString()}
            >
              {timeAgo(conversation.lastMessageAt, now)}
            </span>
          </div>

          <div className="mt-0.5 truncate text-sm font-medium">{conversation.subject}</div>

          {snippet ? (
            <p
              className={`clamp-2 mt-1 text-xs leading-relaxed ${muted}`}
              style={hot ? undefined : { color: 'var(--text-muted)' }}
            >
              <span style={{ opacity: 0.75 }}>
                {snippet.direction === 'outbound' ? 'You: ' : `${snippet.authorName.split(' ')[0]}: `}
              </span>
              {snippet.body}
            </p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <SlaChip
              status={sla.status}
              owedHours={sla.owedHours}
              remainingHours={sla.remainingHours}
              budgetHours={sla.budgetHours}
              onGradient={hot}
            />

            {conversation.waitingOn === 'them' ? (
              <Badge tone="neutral" title={`Quiet for ${workingHours(item.quietHours)} of working time`}>
                Waiting on client
              </Badge>
            ) : null}

            {conversation.hasDraft ? <Badge tone="accent">Draft</Badge> : null}

            {conversation.state === 'snoozed' && conversation.snoozedUntil && conversation.snoozedUntil > now ? (
              <Badge tone="info">Snoozed</Badge>
            ) : null}

            {deal ? (
              <Badge tone="accent" title={`${deal.name} — ${deal.stage}`}>
                Deal · {deal.stage}
              </Badge>
            ) : null}

            {conversation.tags.slice(0, 2).map((tag) => (
              <Tag key={tag} label={tag} />
            ))}

            <span className="ml-auto flex items-center gap-1.5">
              {assignee ? (
                <>
                  <Avatar name={assignee.name} id={assignee.id} size={20} />
                  <span className={`text-xs ${muted}`} style={hot ? undefined : { color: 'var(--text-faint)' }}>
                    {assignee.name.split(' ')[0]}
                  </span>
                </>
              ) : (
                <Badge tone={hot ? 'neutral' : 'warn'}>Unassigned</Badge>
              )}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
