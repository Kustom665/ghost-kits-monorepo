'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import type { FolderCounts } from '@agency/core';
import { Avatar } from './ui.tsx';
import { LiveIndicator } from './live.tsx';

/**
 * The navigation rail. It is a client component only because the active state
 * follows the URL — everything it links to is a plain server-rendered route, so
 * the inbox still works with JavaScript disabled.
 */

function Icon({ path }: { path: ReactNode }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {path}
    </svg>
  );
}

const ICONS = {
  inbox: <><path d="M4 13h4l2 3h4l2-3h4" /><path d="M4 13 6 5h12l2 8v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></>,
  mine: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  unassigned: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20a7 7 0 0 1 9-6.7" /><path d="M17 17h5" /></>,
  drafts: <><path d="M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M13.5 6.5 17.5 10.5" /></>,
  snoozed: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 1.8" /></>,
  closed: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></>,
  pipeline: <><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M22 19H2" /></>,
  accounts: <><path d="M3 20h18" /><path d="M5 20V7l7-4 7 4v13" /><path d="M10 20v-5h4v5" /></>,
  pulse: <><path d="M3 12h4l2.5-6 4 13L16 12h5" /></>,
} as const;

type IconKey = keyof typeof ICONS;

const PRIMARY: Array<{ href: string; label: string; icon: IconKey }> = [
  { href: '/', label: 'Inbox', icon: 'inbox' },
  { href: '/pipeline', label: 'Pipeline', icon: 'pipeline' },
  { href: '/accounts', label: 'Accounts', icon: 'accounts' },
  { href: '/pulse', label: 'Pulse', icon: 'pulse' },
];

const FOLDERS: Array<{ folder: string; label: string; icon: IconKey; key: keyof FolderCounts }> = [
  { folder: 'inbox', label: 'Inbox', icon: 'inbox', key: 'inbox' },
  { folder: 'mine', label: 'Assigned to me', icon: 'mine', key: 'mine' },
  { folder: 'unassigned', label: 'Unassigned', icon: 'unassigned', key: 'unassigned' },
  { folder: 'drafts', label: 'Drafts', icon: 'drafts', key: 'drafts' },
  { folder: 'snoozed', label: 'Snoozed', icon: 'snoozed', key: 'snoozed' },
  { folder: 'closed', label: 'Closed', icon: 'closed', key: 'closed' },
];

export function Rail({
  agencyName,
  viewerName,
  viewerId,
  viewerRole,
  counts,
  urgent,
}: {
  agencyName: string;
  viewerName: string;
  viewerId: string;
  viewerRole: string;
  counts: FolderCounts;
  urgent: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeFolder = searchParams.get('folder') ?? 'inbox';
  const onInbox = pathname === '/';

  return (
    <aside className="flex w-full shrink-0 flex-col gap-6 lg:sticky lg:top-0 lg:h-screen lg:w-[248px] lg:overflow-y-auto lg:py-5 lg:pl-5">
      <Link href="/" className="flex items-center gap-3 px-1">
        <span
          className="grid h-10 w-10 place-items-center rounded-xl text-sm font-bold text-white"
          style={{ background: 'var(--grad-cool)' }}
          aria-hidden
        >
          CF
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">CentralFlow</span>
          <span className="block truncate text-xs" style={{ color: 'var(--text-faint)' }}>
            {agencyName}
          </span>
        </span>
      </Link>

      <nav className="scroll-x flex gap-1 lg:flex-col" aria-label="Sections">
        {PRIMARY.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rail-link ${active ? 'rail-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon path={ICONS[item.icon]} />
              <span className="whitespace-nowrap">{item.label}</span>
              {item.href === '/' && urgent > 0 ? (
                <span
                  className="tnum ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                  style={{ background: 'var(--bad-bg)', color: 'var(--bad)' }}
                  title={`${urgent} threads past their response target`}
                >
                  {urgent}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="min-w-0">
        <div
          className="mb-2 px-2 text-[11px] font-semibold tracking-wider uppercase"
          style={{ color: 'var(--text-faint)' }}
        >
          Folders
        </div>
        <nav className="scroll-x flex gap-1 lg:flex-col" aria-label="Folders">
          {FOLDERS.map((item) => {
            const active = onInbox && activeFolder === item.folder;
            const count = counts[item.key];
            return (
              <Link
                key={item.folder}
                href={`/?folder=${item.folder}`}
                className={`rail-link ${active ? 'rail-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon path={ICONS[item.icon]} />
                <span className="whitespace-nowrap">{item.label}</span>
                {count > 0 ? (
                  <span
                    className="tnum ml-auto text-xs"
                    style={{ color: active ? 'var(--text)' : 'var(--text-faint)' }}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <LiveIndicator />
        <div className="panel-2 flex items-center gap-3 p-3">
          <Avatar name={viewerName} id={viewerId} size={34} />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold">{viewerName}</span>
            <span className="block truncate text-[11px] capitalize" style={{ color: 'var(--text-faint)' }}>
              {viewerRole.replace('_', ' ')}
            </span>
          </span>
        </div>
      </div>
    </aside>
  );
}
