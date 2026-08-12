import Link from 'next/link';
import {
  FOLDER_META,
  assessAll,
  buildTeamLoad,
  buildTriage,
  countFolders,
  inFolder,
  matchesStatus,
  summarizeSla,
  type Folder,
  type StatusFilter,
} from '@agency/core';
import { ConversationRow } from '@/components/conversation-row.tsx';
import { Avatar, Empty, Panel, PanelHeader, PillLink, Reasons, Stat } from '@/components/ui.tsx';
import { getSnippets, getViewerId, loadSnapshot } from '@/db/queries.ts';
import { workingHours } from '@/lib/format.ts';

// Every figure on this page is measured against the current clock, so the page
// is rendered per request rather than frozen into the build.
export const dynamic = 'force-dynamic';

const FOLDERS: Folder[] = ['inbox', 'mine', 'unassigned', 'drafts', 'snoozed', 'closed', 'all'];

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'waiting_on_us', label: 'Waiting on us' },
  { key: 'breached', label: 'Late' },
  { key: 'waiting_on_them', label: 'Waiting on client' },
];

type Params = { folder?: string; status?: string; sort?: string; q?: string };

function buildHref(current: Params, patch: Params): string {
  const merged = { ...current, ...patch };
  const query = new URLSearchParams();
  if (merged.folder && merged.folder !== 'inbox') query.set('folder', merged.folder);
  if (merged.status && merged.status !== 'all') query.set('status', merged.status);
  if (merged.sort && merged.sort !== 'priority') query.set('sort', merged.sort);
  if (merged.q) query.set('q', merged.q);
  const qs = query.toString();
  return qs ? `/?${qs}` : '/';
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;

  const folder: Folder = FOLDERS.includes(params.folder as Folder) ? (params.folder as Folder) : 'inbox';
  const status: StatusFilter = STATUS_FILTERS.some((f) => f.key === params.status)
    ? (params.status as StatusFilter)
    : 'all';
  const sort = params.sort === 'recent' ? 'recent' : 'priority';
  const query = (params.q ?? '').trim();
  const current: Params = { folder, status, sort, q: query };

  const snapshot = loadSnapshot();
  const viewerId = getViewerId();
  const snippets = getSnippets();
  const teamById = new Map(snapshot.team.map((m) => [m.id, m]));

  const sla = assessAll(snapshot.conversations, snapshot.accounts, snapshot.now);
  const ranked = buildTriage(
    snapshot.conversations,
    snapshot.accounts,
    snapshot.contacts,
    snapshot.deals,
    snapshot.now,
  );

  const needle = query.toLowerCase();
  const visible = ranked.filter((item) => {
    if (!inFolder(item.conversation, folder, snapshot.now, viewerId)) return false;
    if (!matchesStatus(item, status, snapshot.now)) return false;
    if (!needle) return true;
    const haystack = `${item.conversation.subject} ${item.account.name} ${item.contact?.name ?? ''} ${
      snippets.get(item.conversation.id)?.body ?? ''
    }`.toLowerCase();
    return haystack.includes(needle);
  });

  const list =
    sort === 'recent'
      ? [...visible].sort((a, b) => b.conversation.lastMessageAt.localeCompare(a.conversation.lastMessageAt))
      : visible;

  // Only the open queue is summarised — closed threads would flatter every
  // figure on this panel.
  const openItems = ranked.filter((item) => inFolder(item.conversation, 'inbox', snapshot.now, viewerId));
  const summary = summarizeSla(openItems.map((item) => item.sla));
  const counts = countFolders(snapshot.conversations, snapshot.now, viewerId);
  const load = buildTeamLoad(snapshot.team, snapshot.conversations, sla, snapshot.now).filter(
    (entry) => entry.openThreads > 0,
  );

  const top = list[0];
  const hotId = sort === 'priority' && top?.sla.status === 'breached' ? top.conversation.id : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{FOLDER_META[folder].label}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {FOLDER_META[folder].hint} · {list.length} thread{list.length === 1 ? '' : 's'}
          </p>
        </div>

        <form method="get" className="flex items-center gap-2">
          {folder !== 'inbox' ? <input type="hidden" name="folder" value={folder} /> : null}
          {status !== 'all' ? <input type="hidden" name="status" value={status} /> : null}
          {sort !== 'priority' ? <input type="hidden" name="sort" value={sort} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search threads, accounts, people…"
            className="field w-[min(320px,60vw)]"
            aria-label="Search conversations"
          />
          <button type="submit" className="btn">
            Search
          </button>
        </form>
      </header>

      <div className="scroll-x flex items-center gap-2 pb-1">
        {STATUS_FILTERS.map((filter) => (
          <PillLink
            key={filter.key}
            href={buildHref(current, { status: filter.key })}
            active={status === filter.key}
          >
            {filter.label}
          </PillLink>
        ))}
        <span className="mx-1 h-5 w-px shrink-0" style={{ background: 'var(--border)' }} aria-hidden />
        <PillLink href={buildHref(current, { sort: 'priority' })} active={sort === 'priority'}>
          Priority
        </PillLink>
        <PillLink href={buildHref(current, { sort: 'recent' })} active={sort === 'recent'}>
          Newest
        </PillLink>
      </div>

      <div className="flex flex-col gap-5 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {list.length === 0 ? (
            <Panel>
              <Empty>
                Nothing here.{' '}
                {query ? (
                  <Link href={buildHref(current, { q: '' })} style={{ color: 'var(--accent-soft)' }}>
                    Clear the search
                  </Link>
                ) : (
                  'This folder is empty.'
                )}
              </Empty>
            </Panel>
          ) : (
            list.map((item) => (
              <ConversationRow
                key={item.conversation.id}
                item={item}
                snippet={snippets.get(item.conversation.id)}
                assignee={item.conversation.assigneeId ? teamById.get(item.conversation.assigneeId) : undefined}
                now={snapshot.now}
                hot={item.conversation.id === hotId}
              />
            ))
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[320px]">
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Owed a reply"
              value={summary.owed}
              tone={summary.owed > 0 ? 'accent' : 'ok'}
              hint={`median wait ${workingHours(summary.medianOwedHours)}`}
            />
            <Stat
              label="Past target"
              value={summary.breached}
              tone={summary.breached > 0 ? 'bad' : 'ok'}
              hint={summary.worstOwedHours > 0 ? `worst ${workingHours(summary.worstOwedHours)}` : 'all inside target'}
            />
            <Stat
              label="Due soon"
              value={summary.dueSoon}
              tone={summary.dueSoon > 0 ? 'warn' : 'neutral'}
              hint="inside the last quarter of budget"
            />
            <Stat
              label="Unowned"
              value={counts.unassigned}
              tone={counts.unassigned > 0 ? 'warn' : 'ok'}
              hint="nobody has picked these up"
            />
          </div>

          {top && sort === 'priority' ? (
            <Panel>
              <PanelHeader
                title="Why this order"
                subtitle={`Top of the queue: ${top.account.name}`}
              />
              <div className="p-4 pt-3">
                <Reasons items={top.reasons} limit={4} />
                <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-faint)' }}>
                  Threads are ranked by what a slow reply costs — response debt against the
                  account&rsquo;s target, the size of the relationship, whether a live deal is
                  attached, and whether anyone owns it. Working hours only: the weekend does not
                  burn a client&rsquo;s budget.
                </p>
              </div>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title="Who is carrying the queue" subtitle="Open threads by owner" />
            <div className="flex flex-col">
              {load.length === 0 ? (
                <Empty>Nothing assigned.</Empty>
              ) : (
                load.map((entry) => (
                  <div
                    key={entry.member.id}
                    className="flex items-center gap-3 border-b p-3 last:border-b-0 hairline"
                  >
                    <Avatar name={entry.member.name} id={entry.member.id} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold">{entry.member.name}</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        {entry.openThreads} open · {entry.accounts} account
                        {entry.accounts === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="tnum text-sm font-semibold"
                        style={{ color: entry.breachedThreads > 0 ? 'var(--bad)' : 'var(--text-muted)' }}
                      >
                        {entry.owedThreads}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                        owed
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
