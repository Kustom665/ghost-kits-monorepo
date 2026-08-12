import type { ReactNode } from 'react';
import Link from 'next/link';
import type { AccountTier, SlaStatus } from '@agency/core';
import { TIER_META } from '@agency/core';
import { avatarGradient, initials, workingHours } from '@/lib/format.ts';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'accent' | 'neutral';

const TONE_VARS: Record<Tone, { fg: string; bg: string }> = {
  ok: { fg: 'var(--ok)', bg: 'var(--ok-bg)' },
  warn: { fg: 'var(--warn)', bg: 'var(--warn-bg)' },
  bad: { fg: 'var(--bad)', bg: 'var(--bad-bg)' },
  info: { fg: 'var(--info)', bg: 'var(--info-bg)' },
  accent: { fg: 'var(--accent-soft)', bg: 'var(--accent-bg)' },
  neutral: { fg: 'var(--text-muted)', bg: 'var(--panel-2)' },
};

export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  const { fg, bg } = TONE_VARS[tone];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ color: fg, background: bg }}
    >
      {children}
    </span>
  );
}

export function Panel({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article' | 'aside';
}) {
  return <Tag className={`panel ${className}`}>{children}</Tag>;
}

export function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4 hairline">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="panel-2 p-4">
      <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div
        className="tnum mt-1.5 text-2xl font-semibold tracking-tight"
        style={{ color: tone === 'neutral' ? 'var(--text)' : TONE_VARS[tone].fg }}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-faint)' }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function Avatar({
  name,
  id,
  size = 36,
  dim = false,
}: {
  name: string;
  id: string;
  size?: number;
  dim?: boolean;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: avatarGradient(id),
        opacity: dim ? 0.55 : 1,
      }}
      aria-hidden
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function Meter({
  value,
  max,
  tone = 'accent',
  label,
}: {
  value: number;
  max: number;
  tone?: Tone;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--panel-3)' }}
      role="img"
      aria-label={label ?? `${value} of ${max}`}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: TONE_VARS[tone].fg }}
      />
    </div>
  );
}

const SLA_TONE: Record<SlaStatus, Tone> = {
  breached: 'bad',
  due_soon: 'warn',
  clear: 'ok',
  not_owed: 'neutral',
};

export function SlaChip({
  status,
  owedHours,
  remainingHours,
  budgetHours,
  onGradient = false,
}: {
  status: SlaStatus;
  owedHours: number;
  remainingHours: number;
  budgetHours: number;
  onGradient?: boolean;
}) {
  if (status === 'not_owed') return null;

  const text =
    status === 'breached'
      ? `${workingHours(-remainingHours)} over`
      : `${workingHours(Math.max(0, remainingHours))} left`;

  if (onGradient) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
        style={{ background: 'rgba(0,0,0,0.28)', color: '#fff' }}
        title={`Waiting ${workingHours(owedHours)} of working time against a ${budgetHours}h target`}
      >
        {text}
      </span>
    );
  }

  return (
    <Badge
      tone={SLA_TONE[status]}
      title={`Waiting ${workingHours(owedHours)} of working time against a ${budgetHours}h target`}
    >
      {text}
    </Badge>
  );
}

const TIER_TONE: Record<AccountTier, Tone> = {
  flagship: 'accent',
  growth: 'info',
  starter: 'neutral',
  prospect: 'warn',
};

export function TierBadge({ tier }: { tier: AccountTier }) {
  return (
    <Badge tone={TIER_TONE[tier]} title={TIER_META[tier].description}>
      {TIER_META[tier].label}
    </Badge>
  );
}

export function Tag({ label }: { label: string }) {
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={{ background: 'var(--panel-3)', color: 'var(--text-faint)' }}
    >
      #{label}
    </span>
  );
}

/** Filter pill that navigates by query string — no client JS required. */
export function PillLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`pill ${active ? 'pill-active' : ''}`}>
      {children}
    </Link>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="p-10 text-center text-sm" style={{ color: 'var(--text-faint)' }}>
      {children}
    </div>
  );
}

export function Reasons({ items, limit = 3 }: { items: string[]; limit?: number }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {items.slice(0, limit).map((reason) => (
        <li key={reason} className="flex gap-2 text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
          <span aria-hidden style={{ color: 'var(--accent-soft)' }}>
            ·
          </span>
          <span>{reason}</span>
        </li>
      ))}
    </ul>
  );
}
