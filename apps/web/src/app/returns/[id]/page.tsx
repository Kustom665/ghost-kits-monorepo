import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  STAGES,
  STAGE_META,
  assessReturnRisk,
  computeStageMetrics,
  daysBetween,
  isTerminal,
  type Stage,
} from '@taxflow/core';
import { getReturnDetail } from '@/db/queries.ts';
import { loadSnapshot } from '@/db/queries.ts';
import { advanceStageAction, setDocStatusAction } from '@/app/actions.ts';
import { Badge, Card, CardHeader, EmptyState, Stat, type Tone } from '@/components/ui.tsx';
import { fmtDate, fmtDays, fmtHours, fmtMoney, RISK_LABEL, RISK_TONE } from '@/lib/format.ts';

export const dynamic = 'force-dynamic';

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = getReturnDetail(id);
  if (!detail) notFound();

  const { ret, client, events, docs, reminders, staff } = detail;
  const snapshot = loadSnapshot();
  const metrics = computeStageMetrics(snapshot);
  const risk = assessReturnRisk(ret, new Map(metrics.map((m) => [m.stage, m])), snapshot.now);

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const meta = STAGE_META[ret.stage];
  const daysInStage = daysBetween(ret.stageEnteredAt, snapshot.now);
  const overSla = daysInStage - meta.slaDays;

  const pendingDocs = docs.filter((d) => d.status === 'pending');
  const currentIdx = STAGES.indexOf(ret.stage);

  // Where this return can go next: forward one step, or back to prep from
  // review, or onto extension.
  const nextStages: Stage[] = [];
  if (!isTerminal(ret.stage)) {
    const forward = STAGES[currentIdx + 1];
    if (forward && forward !== 'extended') nextStages.push(forward);
    if (ret.stage === 'in_review') nextStages.push('in_prep');
    if (!ret.extended) nextStages.push('extended');
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/pipeline" className="text-xs no-underline" style={{ color: 'var(--info)' }}>
          ← Pipeline
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{client.name}</h1>
          <Badge>{ret.entityType}</Badge>
          <Badge>{ret.taxYear}</Badge>
          {ret.extended ? <Badge tone="info">extended</Badge> : null}
          {risk ? <Badge tone={RISK_TONE[risk.level]}>{RISK_LABEL[risk.level]}</Badge> : null}
        </div>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>
          {client.email} · {client.phone} · responsiveness {client.responsivenessScore}/100
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Current stage"
          value={meta.label}
          hint={`${fmtDays(daysInStage)} in stage · target ${meta.slaDays}d`}
          tone={overSla > 0 ? 'bad' : 'ok'}
        />
        <Stat
          label="Due"
          value={fmtDate(ret.dueDate)}
          hint={`${Math.round(daysBetween(snapshot.now, ret.dueDate))} days away`}
        />
        <Stat
          label="Projected finish"
          value={risk ? fmtDate(risk.projectedCompletion) : '—'}
          tone={risk ? RISK_TONE[risk.level] : 'neutral'}
          hint={
            risk
              ? `${risk.slackDays >= 0 ? '+' : ''}${Math.round(risk.slackDays)} days of slack`
              : 'return is closed'
          }
        />
        <Stat
          label="Budget"
          value={fmtHours(ret.estimatedHours)}
          hint={`${ret.complexity} · prior-year fee ${fmtMoney(ret.priorYearFee)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* ---- Projection breakdown ------------------------------------- */}
          {risk ? (
            <Card>
              <CardHeader
                title="How that projection is built"
                subtitle="Each remaining stage at the firm's measured pace. Queue stages use the worse of observed dwell and current queue depth; time already served here is credited."
              />
              <div className="p-4">
                <div className="flex flex-wrap gap-2">
                  {risk.path.map((step, i) => (
                    <div
                      key={step.stage}
                      className="rounded-lg border px-2.5 py-1.5 hairline"
                      style={i === 0 ? { borderColor: 'var(--info)', background: 'var(--info-bg)' } : undefined}
                    >
                      <div className="text-xs font-medium whitespace-nowrap">
                        {STAGE_META[step.stage].label}
                      </div>
                      <div className="tnum text-xs" style={{ color: 'var(--text-muted)' }}>
                        {fmtDays(step.days)}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="tnum mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {fmtDays(risk.projectedDays)} of pipeline remaining against{' '}
                  {Math.round(risk.daysToDue)} days until the deadline.
                </p>
              </div>
            </Card>
          ) : null}

          {/* ---- Documents ------------------------------------------------ */}
          <Card>
            <CardHeader
              title="Documents"
              subtitle={`${docs.filter((d) => d.status === 'received').length} received · ${pendingDocs.length} outstanding`}
              action={
                pendingDocs.length > 0 ? (
                  <Link href="/chase" className="text-xs font-medium no-underline" style={{ color: 'var(--info)' }}>
                    Draft a nudge →
                  </Link>
                ) : null
              }
            />
            {docs.length === 0 ? (
              <EmptyState>No document requests on this return.</EmptyState>
            ) : (
              <ul>
                {docs.map((d) => {
                  const tone: Tone =
                    d.status === 'received' ? 'ok' : d.status === 'not_applicable' ? 'neutral' : 'warn';
                  return (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 last:border-0 hairline"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{d.docType}</span>
                          <Badge tone={tone}>{d.status.replace('_', ' ')}</Badge>
                          {d.rolledForward ? (
                            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                              rolled forward
                            </span>
                          ) : null}
                        </div>
                        <div className="tnum mt-0.5 text-xs" style={{ color: 'var(--text-faint)' }}>
                          asked {fmtDate(d.requestedAt)}
                          {d.receivedAt ? ` · received ${fmtDate(d.receivedAt)}` : ''}
                          {d.remindersSent > 0 ? ` · ${d.remindersSent} reminder(s)` : ''}
                        </div>
                      </div>

                      {d.status === 'pending' ? (
                        <div className="flex gap-1.5">
                          <DocButton docId={d.id} returnId={ret.id} status="received" label="Mark received" />
                          <DocButton docId={d.id} returnId={ret.id} status="not_applicable" label="N/A" />
                        </div>
                      ) : (
                        <DocButton docId={d.id} returnId={ret.id} status="pending" label="Reopen" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* ---- Timeline -------------------------------------------------- */}
          <Card>
            <CardHeader
              title="Timeline"
              subtitle="The event log every timing figure in this app is derived from."
            />
            <ol className="p-4">
              {[...events].reverse().map((e, i, arr) => {
                const next = arr[i + 1];
                const dwell = next ? daysBetween(next.at, e.at) : null;
                return (
                  <li key={e.id} className="flex gap-3 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: e.isRework ? 'var(--bad)' : 'var(--info)' }}
                      />
                      {i < arr.length - 1 ? (
                        <span className="w-px flex-1" style={{ background: 'var(--border)' }} />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {STAGE_META[e.toStage].label}
                        </span>
                        {e.isRework ? <Badge tone="bad">kicked back</Badge> : null}
                        <span className="tnum text-xs" style={{ color: 'var(--text-faint)' }}>
                          {fmtDate(e.at)}
                        </span>
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {e.actorId ? (staffById.get(e.actorId)?.name ?? 'System') : 'System'}
                        {dwell !== null ? ` · spent ${fmtDays(dwell)} in ${STAGE_META[e.fromStage ?? e.toStage].label}` : ''}
                      </div>
                      {e.note ? (
                        <p className="mt-1 text-xs italic" style={{ color: 'var(--text-muted)' }}>
                          “{e.note}”
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        {/* ---- Sidebar ------------------------------------------------------ */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Move this return" />
            <div className="flex flex-col gap-2 p-4">
              {nextStages.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  This return is closed.
                </p>
              ) : (
                nextStages.map((s) => (
                  <form key={s} action={advanceStageAction}>
                    <input type="hidden" name="returnId" value={ret.id} />
                    <input type="hidden" name="toStage" value={s} />
                    <input
                      type="hidden"
                      name="actorId"
                      value={
                        (s === 'in_review' || s === 'review_queue'
                          ? ret.reviewerId
                          : s === 'partner_signoff'
                            ? ret.partnerId
                            : ret.preparerId) ?? ''
                      }
                    />
                    <button
                      type="submit"
                      className="w-full rounded-md border px-3 py-2 text-left text-sm font-medium hairline"
                      style={
                        s === 'in_prep' && ret.stage === 'in_review'
                          ? { color: 'var(--bad)' }
                          : s === 'extended'
                            ? { color: 'var(--text-muted)' }
                            : { background: 'var(--info-bg)', color: 'var(--info)', borderColor: 'var(--info)' }
                      }
                    >
                      {s === 'in_prep' && ret.stage === 'in_review'
                        ? 'Kick back to preparer'
                        : s === 'extended'
                          ? 'File an extension'
                          : `Advance to ${STAGE_META[s].label}`}
                    </button>
                  </form>
                ))
              )}
              {pendingDocs.length > 0 && ret.stage === 'docs_pending' ? (
                <p className="text-xs" style={{ color: 'var(--warn)' }}>
                  {pendingDocs.length} document{pendingDocs.length === 1 ? '' : 's'} still
                  outstanding. Advancing now moves an incomplete return into prep.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Assignment" />
            <dl className="p-4 text-sm">
              {(
                [
                  ['Preparer', ret.preparerId],
                  ['Reviewer', ret.reviewerId],
                  ['Partner', ret.partnerId],
                ] as const
              ).map(([label, sid]) => (
                <div key={label} className="flex justify-between gap-3 py-1">
                  <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
                  <dd className="font-medium">
                    {sid ? (
                      <Link href={`/pipeline?owner=${sid}`} className="no-underline hover:underline">
                        {staffById.get(sid)?.name ?? 'Unassigned'}
                      </Link>
                    ) : (
                      'Unassigned'
                    )}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 py-1">
                <dt style={{ color: 'var(--text-muted)' }}>Opened</dt>
                <dd className="tnum font-medium">{fmtDate(ret.createdAt)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title={`Client touches (${reminders.length})`} />
            {reminders.length === 0 ? (
              <EmptyState>No reminders have been sent on this return.</EmptyState>
            ) : (
              <ul className="p-4 text-sm">
                {reminders.map((r) => (
                  <li key={r.id} className="border-b py-2 last:border-0 hairline">
                    <div className="flex items-center justify-between gap-2">
                      <Badge>{r.channel}</Badge>
                      <span className="tnum text-xs" style={{ color: 'var(--text-faint)' }}>
                        {fmtDate(r.sentAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function DocButton({
  docId,
  returnId,
  status,
  label,
}: {
  docId: string;
  returnId: string;
  status: string;
  label: string;
}) {
  return (
    <form action={setDocStatusAction}>
      <input type="hidden" name="docId" value={docId} />
      <input type="hidden" name="returnId" value={returnId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className="rounded-md border px-2 py-1 text-xs font-medium whitespace-nowrap hairline"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </button>
    </form>
  );
}
