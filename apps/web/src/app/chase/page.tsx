import Link from 'next/link';
import { draftReminder, type ChaseTemperature } from '@taxflow/core';
import { getAnalytics } from '@/lib/analytics.ts';
import { getFirmName } from '@/db/queries.ts';
import { logReminderAction } from '@/app/actions.ts';
import { Badge, Card, CardHeader, EmptyState, Stat, Td, Th, type Tone } from '@/components/ui.tsx';
import { fmtDate, fmtDays, fmtHours } from '@/lib/format.ts';

export const dynamic = 'force-dynamic';

const TEMP_TONE: Record<ChaseTemperature, Tone> = {
  fresh: 'ok',
  chasing: 'info',
  cold: 'warn',
  frozen: 'bad',
};

const TEMP_HINT: Record<ChaseTemperature, string> = {
  fresh: 'responded in the last week',
  chasing: 'quiet for 1–2 weeks',
  cold: 'quiet for 2–4 weeks',
  frozen: 'quiet for over a month',
};

export default async function ChasePage({
  searchParams,
}: {
  searchParams: Promise<{ temp?: string }>;
}) {
  const params = await searchParams;
  const temp = (['fresh', 'chasing', 'cold', 'frozen'] as const).find((t) => t === params.temp);

  const a = getAnalytics();
  const firmName = getFirmName();
  const rows = temp ? a.chase.filter((r) => r.temperature === temp) : a.chase;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Document chase</h1>
        <p className="mt-0.5 max-w-3xl text-sm" style={{ color: 'var(--text-muted)' }}>
          Ranked by who to call first — a blend of how long they have been silent, how close their
          deadline is, and what the engagement is worth. Temperature measures silence, not how long
          ago you asked: a client who sent three items yesterday is still warm.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Returns blocked"
          value={a.chaseSummary.returnsBlocked}
          hint={`${a.chaseSummary.docsOutstanding} documents outstanding`}
          tone="warn"
        />
        <Stat
          label="Work you cannot start"
          value={fmtHours(a.chaseSummary.hoursBlocked)}
          hint="budgeted hours sitting behind missing documents"
          tone="warn"
        />
        <Stat
          label="Never nudged"
          value={a.chaseSummary.neverReminded}
          hint="outstanding documents with zero reminders sent"
          tone={a.chaseSummary.neverReminded > 0 ? 'bad' : 'ok'}
        />
        <Stat
          label="Median wait"
          value={fmtDays(a.chaseSummary.medianDaysWaiting)}
          hint="since the request went out"
        />
      </div>

      <div className="scroll-x -mx-1 flex gap-1.5 px-1">
        <Link
          href="/chase"
          className="rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap no-underline hairline"
          style={!temp ? { background: 'var(--surface-2)', color: 'var(--text)' } : { color: 'var(--text-muted)' }}
        >
          All {a.chase.length}
        </Link>
        {(['frozen', 'cold', 'chasing', 'fresh'] as const).map((t) => (
          <Link
            key={t}
            href={`/chase?temp=${t}`}
            title={TEMP_HINT[t]}
            className="rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap capitalize no-underline hairline"
            style={
              temp === t
                ? { background: 'var(--surface-2)', color: 'var(--text)' }
                : { color: 'var(--text-muted)' }
            }
          >
            {t} <span className="tnum">{a.chaseSummary.byTemperature[t]}</span>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader
          title={`${rows.length} clients to chase`}
          subtitle="Each nudge is pre-drafted with that client's specific missing items — generic reminders are the ones that get ignored."
        />
        {rows.length === 0 ? (
          <EmptyState>Nothing outstanding here. Every document has been received.</EmptyState>
        ) : (
          <ul>
            {rows.slice(0, 60).map((row) => (
              <li key={row.ret.id} className="border-b p-4 last:border-0 hairline">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/returns/${row.ret.id}`}
                        className="text-sm font-semibold no-underline hover:underline"
                      >
                        {row.client.name}
                      </Link>
                      <Badge>{row.ret.entityType}</Badge>
                      <Badge tone={TEMP_TONE[row.temperature]} title={TEMP_HINT[row.temperature]}>
                        {row.temperature}
                      </Badge>
                      {row.remindersSent === 0 ? <Badge tone="bad">never nudged</Badge> : null}
                    </div>

                    <div className="tnum mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {row.received}/{row.total} received · asked {fmtDays(row.daysWaiting)} ago ·
                      silent {fmtDays(row.daysSinceLastResponse)} ·{' '}
                      {row.remindersSent} reminder{row.remindersSent === 1 ? '' : 's'} · due{' '}
                      {fmtDate(row.ret.dueDate)}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {row.missingDocs.map((d) => (
                        <span
                          key={d}
                          className="rounded border px-1.5 py-0.5 text-xs hairline"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
                      priority
                    </div>
                    <div className="tnum text-lg font-semibold">{Math.round(row.priority)}</div>
                  </div>
                </div>

                <details className="mt-3">
                  <summary
                    className="cursor-pointer text-xs font-medium select-none"
                    style={{ color: 'var(--info)' }}
                  >
                    Draft the follow-up
                  </summary>
                  <form action={logReminderAction} className="mt-2">
                    <input type="hidden" name="returnId" value={row.ret.id} />
                    <textarea
                      name="body"
                      rows={12}
                      defaultValue={draftReminder(row, firmName)}
                      className="w-full rounded-lg border p-3 font-mono text-xs hairline"
                      style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        name="channel"
                        defaultValue="email"
                        className="rounded-md border px-2 py-1.5 text-xs hairline"
                        style={{ background: 'var(--surface)', color: 'var(--text)' }}
                        aria-label="Channel"
                      >
                        <option value="email">Email</option>
                        <option value="portal">Portal message</option>
                        <option value="sms">SMS</option>
                        <option value="call">Phone call</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded-md px-3 py-1.5 text-xs font-semibold"
                        style={{ background: 'var(--info)', color: 'var(--surface)' }}
                      >
                        Log this nudge
                      </button>
                      <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                        Records the touch and resets this client&rsquo;s reminder count. Wiring the
                        send to a mail provider is the one remaining step.
                      </span>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 60 ? (
          <div className="p-3 text-center text-xs" style={{ color: 'var(--text-faint)' }}>
            Showing the top 60 of {rows.length} by priority.
          </div>
        ) : null}
      </Card>
    </div>
  );
}
