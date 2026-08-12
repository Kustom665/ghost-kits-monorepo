import type { ReactNode } from 'react';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

const TONE_VARS: Record<Tone, { fg: string; bg: string }> = {
  ok: { fg: 'var(--ok)', bg: 'var(--ok-bg)' },
  warn: { fg: 'var(--warn)', bg: 'var(--warn-bg)' },
  bad: { fg: 'var(--bad)', bg: 'var(--bad-bg)' },
  info: { fg: 'var(--info)', bg: 'var(--info-bg)' },
  neutral: { fg: 'var(--text-muted)', bg: 'var(--surface-2)' },
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
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ color: fg, background: bg }}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return <Tag className={`card ${className}`}>{children}</Tag>;
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b p-4 hairline">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
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
    <div className="card p-4">
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

/** Horizontal proportion bar used for stage WIP and per-person load. */
export function Meter({
  value,
  max,
  tone = 'info',
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
      className="h-2 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--surface-2)' }}
      role="img"
      aria-label={label ?? `${value} of ${max}`}
    >
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${pct}%`, background: TONE_VARS[tone].fg }}
      />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
      {children}
    </div>
  );
}

type Align = 'left' | 'right' | 'center';

/**
 * Written out in full rather than interpolated. Tailwind scans source for
 * complete class names, so a template like `text-${align}` produces nothing.
 */
const ALIGN_CLASS: Record<Align, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function Th({
  children,
  align = 'left',
  className = '',
}: {
  children?: ReactNode;
  align?: Align;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 ${ALIGN_CLASS[align]} text-xs font-semibold whitespace-nowrap ${className}`}
      style={{ color: 'var(--text-muted)' }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className = '',
}: {
  children?: ReactNode;
  align?: Align;
  className?: string;
}) {
  return <td className={`px-3 py-2 ${ALIGN_CLASS[align]} ${className}`}>{children}</td>;
}
