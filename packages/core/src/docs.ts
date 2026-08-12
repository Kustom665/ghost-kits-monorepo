import type {
  Client,
  DocRequest,
  EntityType,
  FirmSnapshot,
  TaxReturn,
} from './types.ts';
import { daysBetween, round, toMs } from './time.ts';

/**
 * The source documents we expect by entity type.
 *
 * This is what makes the "what are we still waiting on" question answerable
 * without a human reading last year's return. `alwaysAsk` items are requested
 * for every engagement; the rest are rolled forward only if the client had
 * one last year.
 */
export const DOC_CATALOG: Record<EntityType, Array<{ docType: string; alwaysAsk: boolean }>> = {
  '1040': [
    { docType: 'Prior year return', alwaysAsk: true },
    { docType: 'Engagement letter (signed)', alwaysAsk: true },
    { docType: 'W-2', alwaysAsk: false },
    { docType: '1099-INT', alwaysAsk: false },
    { docType: '1099-DIV', alwaysAsk: false },
    { docType: '1099-B (brokerage)', alwaysAsk: false },
    { docType: '1099-NEC', alwaysAsk: false },
    { docType: '1099-R (retirement)', alwaysAsk: false },
    { docType: 'SSA-1099', alwaysAsk: false },
    { docType: '1098 Mortgage interest', alwaysAsk: false },
    { docType: '1098-T Tuition', alwaysAsk: false },
    { docType: 'K-1 (received)', alwaysAsk: false },
    { docType: 'Schedule C income & expenses', alwaysAsk: false },
    { docType: 'Rental property statements', alwaysAsk: false },
    { docType: 'Charitable contribution summary', alwaysAsk: false },
    { docType: 'HSA 1099-SA / 5498-SA', alwaysAsk: false },
    { docType: 'Estimated tax payments made', alwaysAsk: true },
  ],
  '1120S': [
    { docType: 'Engagement letter (signed)', alwaysAsk: true },
    { docType: 'Trial balance', alwaysAsk: true },
    { docType: 'Bank statements (Dec)', alwaysAsk: true },
    { docType: 'Payroll returns (941/940/W-3)', alwaysAsk: true },
    { docType: 'Fixed asset additions & disposals', alwaysAsk: false },
    { docType: 'Loan statements & amortization', alwaysAsk: false },
    { docType: 'Shareholder basis / distributions', alwaysAsk: true },
    { docType: 'Health insurance paid for >2% shareholders', alwaysAsk: false },
  ],
  '1065': [
    { docType: 'Engagement letter (signed)', alwaysAsk: true },
    { docType: 'Trial balance', alwaysAsk: true },
    { docType: 'Bank statements (Dec)', alwaysAsk: true },
    { docType: 'Partner capital roll-forward', alwaysAsk: true },
    { docType: 'Partnership agreement changes', alwaysAsk: false },
    { docType: 'Fixed asset additions & disposals', alwaysAsk: false },
    { docType: 'Loan statements & amortization', alwaysAsk: false },
  ],
  '1120': [
    { docType: 'Engagement letter (signed)', alwaysAsk: true },
    { docType: 'Trial balance', alwaysAsk: true },
    { docType: 'Bank statements (Dec)', alwaysAsk: true },
    { docType: 'Payroll returns (941/940/W-3)', alwaysAsk: true },
    { docType: 'Fixed asset additions & disposals', alwaysAsk: false },
    { docType: 'Officer compensation detail', alwaysAsk: false },
  ],
  '1041': [
    { docType: 'Engagement letter (signed)', alwaysAsk: true },
    { docType: 'Trust/will instrument', alwaysAsk: true },
    { docType: 'Brokerage year-end statements', alwaysAsk: true },
    { docType: '1099s issued to the trust', alwaysAsk: false },
    { docType: 'Distribution detail to beneficiaries', alwaysAsk: true },
  ],
  '990': [
    { docType: 'Engagement letter (signed)', alwaysAsk: true },
    { docType: 'Trial balance', alwaysAsk: true },
    { docType: 'Board minutes', alwaysAsk: false },
    { docType: 'Grant & contribution schedule', alwaysAsk: true },
    { docType: 'Program service accomplishments', alwaysAsk: true },
  ],
};

export type ChaseTemperature = 'fresh' | 'chasing' | 'cold' | 'frozen';

export interface DocChaseRow {
  ret: TaxReturn;
  client: Client;
  outstanding: number;
  received: number;
  total: number;
  /** Days since the earliest still-outstanding request went out. */
  daysWaiting: number;
  /** Days since the client last sent anything at all. */
  daysSinceLastResponse: number;
  remindersSent: number;
  temperature: ChaseTemperature;
  /** The specific documents still missing, so the nudge can be specific. */
  missingDocs: string[];
  /**
   * Chase priority. Weighted by how long we have waited, how close the due
   * date is, and what the engagement is worth — because with 90 clients
   * outstanding, "who do I call first" is the real question.
   */
  priority: number;
}

export function chaseTemperature(daysSinceLastResponse: number): ChaseTemperature {
  if (daysSinceLastResponse < 7) return 'fresh';
  if (daysSinceLastResponse < 14) return 'chasing';
  if (daysSinceLastResponse < 30) return 'cold';
  return 'frozen';
}

/**
 * Build the document-chase worklist: every open return with outstanding
 * documents, ranked by who is worth calling first.
 */
export function buildDocChase(snapshot: FirmSnapshot): DocChaseRow[] {
  const { now, returns, clients, docRequests } = snapshot;
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const byReturn = new Map<string, DocRequest[]>();
  for (const req of docRequests) {
    const list = byReturn.get(req.returnId);
    if (list) list.push(req);
    else byReturn.set(req.returnId, [req]);
  }

  const rows: DocChaseRow[] = [];
  for (const ret of returns) {
    const reqs = byReturn.get(ret.id) ?? [];
    const pending = reqs.filter((r) => r.status === 'pending');
    if (pending.length === 0) continue;

    const client = clientById.get(ret.clientId);
    if (!client) continue;

    const received = reqs.filter((r) => r.status === 'received');
    const earliestRequest = pending.reduce(
      (min, r) => (toMs(r.requestedAt) < toMs(min) ? r.requestedAt : min),
      pending[0].requestedAt,
    );
    const lastReceipt = received.reduce<string | null>(
      (latest, r) =>
        r.receivedAt && (latest === null || toMs(r.receivedAt) > toMs(latest))
          ? r.receivedAt
          : latest,
      null,
    );

    const daysWaiting = round(daysBetween(earliestRequest, now));
    const daysSinceLastResponse = round(
      daysBetween(lastReceipt ?? earliestRequest, now),
    );
    const daysToDue = daysBetween(now, ret.dueDate);

    // Waiting time and deadline pressure dominate; fee breaks ties. Deadline
    // pressure is capped so a single overdue return cannot swamp the list.
    const urgency = Math.max(0, 60 - daysToDue) / 60;
    const priority = round(
      daysSinceLastResponse * 1.5 + urgency * 40 + Math.min(ret.priorYearFee / 500, 12),
    );

    rows.push({
      ret,
      client,
      outstanding: pending.length,
      received: received.length,
      total: reqs.filter((r) => r.status !== 'not_applicable').length,
      daysWaiting,
      daysSinceLastResponse,
      // A nudge covers the whole return, so the count is the number of times
      // we contacted this client — not the sum across every open item, which
      // would report four reminders for one email about four documents.
      remindersSent: Math.max(...pending.map((r) => r.remindersSent)),
      temperature: chaseTemperature(daysSinceLastResponse),
      missingDocs: pending.map((r) => r.docType),
      priority,
    });
  }

  return rows.sort((a, b) => b.priority - a.priority);
}

export interface DocChaseSummary {
  returnsBlocked: number;
  docsOutstanding: number;
  /** Budgeted hours we cannot start because documents are missing. */
  hoursBlocked: number;
  byTemperature: Record<ChaseTemperature, number>;
  /** Clients we have never actually nudged. The cheapest win in the app. */
  neverReminded: number;
  medianDaysWaiting: number;
}

export function summarizeDocChase(rows: DocChaseRow[]): DocChaseSummary {
  const byTemperature: Record<ChaseTemperature, number> = {
    fresh: 0,
    chasing: 0,
    cold: 0,
    frozen: 0,
  };
  for (const row of rows) byTemperature[row.temperature]++;

  const waits = rows.map((r) => r.daysWaiting).sort((a, b) => a - b);

  return {
    returnsBlocked: rows.length,
    docsOutstanding: rows.reduce((sum, r) => sum + r.outstanding, 0),
    hoursBlocked: round(rows.reduce((sum, r) => sum + r.ret.estimatedHours, 0)),
    byTemperature,
    neverReminded: rows.filter((r) => r.remindersSent === 0).length,
    medianDaysWaiting: waits.length ? round(waits[Math.floor(waits.length / 2)]) : 0,
  };
}

/**
 * Draft the next nudge for a client. Deliberately specific: "we need three
 * things" with the list beats "please send your documents", which is why
 * generic organizer reminders get ignored.
 */
export function draftReminder(row: DocChaseRow, firmName: string): string {
  const { client, ret, missingDocs, daysWaiting } = row;
  const list = missingDocs.map((d) => `  • ${d}`).join('\n');
  const due = new Date(ret.dueDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
  const opener =
    daysWaiting > 21
      ? `We still have your ${ret.taxYear} ${ret.entityType} on hold and want to make sure it does not slip.`
      : `We are getting your ${ret.taxYear} ${ret.entityType} underway and are waiting on a few items.`;

  return [
    `Subject: ${missingDocs.length} item${missingDocs.length === 1 ? '' : 's'} needed for your ${ret.taxYear} return`,
    ``,
    `Hi ${client.name.split(' ')[0]},`,
    ``,
    opener,
    ``,
    `To finish, we need:`,
    list,
    ``,
    `Your filing deadline is ${due}. Once these are in, we can move the return into preparation.`,
    `If any item does not apply this year, just reply "N/A" next to it and we will close it out.`,
    ``,
    `Thank you,`,
    firmName,
  ].join('\n');
}
