import type { DatabaseSync } from 'node:sqlite';
import type {
  Client,
  DocRequest,
  DocStatus,
  EntityType,
  FirmSnapshot,
  Reminder,
  Stage,
  StageEvent,
  Staff,
  StaffRole,
  TaxReturn,
} from '@taxflow/core';
import { getDb, isEmpty } from './client.ts';
import { seedDatabase } from './seed.ts';

/* ---------- row mappers ------------------------------------------------- */

type Row = Record<string, unknown>;

const asStaff = (r: Row): Staff => ({
  id: r.id as string,
  name: r.name as string,
  role: r.role as StaffRole,
  weeklyCapacityHours: r.weekly_capacity_hours as number,
  active: (r.active as number) === 1,
});

const asClient = (r: Row): Client => ({
  id: r.id as string,
  name: r.name as string,
  entityType: r.entity_type as EntityType,
  responsivenessScore: r.responsiveness_score as number,
  email: r.email as string,
  phone: r.phone as string,
});

const asReturn = (r: Row): TaxReturn => ({
  id: r.id as string,
  clientId: r.client_id as string,
  taxYear: r.tax_year as number,
  entityType: r.entity_type as EntityType,
  stage: r.stage as Stage,
  stageEnteredAt: r.stage_entered_at as string,
  createdAt: r.created_at as string,
  dueDate: r.due_date as string,
  preparerId: (r.preparer_id as string | null) ?? null,
  reviewerId: (r.reviewer_id as string | null) ?? null,
  partnerId: (r.partner_id as string | null) ?? null,
  estimatedHours: r.estimated_hours as number,
  complexity: r.complexity as TaxReturn['complexity'],
  priorYearFee: r.prior_year_fee as number,
  extended: (r.extended as number) === 1,
  notes: (r.notes as string) ?? '',
});

const asEvent = (r: Row): StageEvent => ({
  id: r.id as string,
  returnId: r.return_id as string,
  fromStage: (r.from_stage as Stage | null) ?? null,
  toStage: r.to_stage as Stage,
  at: r.at as string,
  actorId: (r.actor_id as string | null) ?? null,
  isRework: (r.is_rework as number) === 1,
  note: (r.note as string) ?? '',
});

const asDoc = (r: Row): DocRequest => ({
  id: r.id as string,
  returnId: r.return_id as string,
  docType: r.doc_type as string,
  status: r.status as DocStatus,
  rolledForward: (r.rolled_forward as number) === 1,
  requestedAt: r.requested_at as string,
  receivedAt: (r.received_at as string | null) ?? null,
  remindersSent: r.reminders_sent as number,
  lastReminderAt: (r.last_reminder_at as string | null) ?? null,
});

const asReminder = (r: Row): Reminder => ({
  id: r.id as string,
  returnId: r.return_id as string,
  channel: r.channel as Reminder['channel'],
  sentAt: r.sent_at as string,
  sentById: (r.sent_by_id as string | null) ?? null,
  body: (r.body as string) ?? '',
});

/* ---------- reads -------------------------------------------------------- */

/**
 * Load the whole firm into memory.
 *
 * A practice with a few hundred returns and a few thousand events is small
 * enough that this is measured in milliseconds, and it keeps the analytics
 * layer as pure functions over plain data instead of a pile of SQL. If a firm
 * outgrows it, the same functions can be fed from a windowed query.
 */
export function loadSnapshot(nowIso?: string): FirmSnapshot {
  const db = ensureSeeded();
  const now = nowIso ?? new Date().toISOString();

  return {
    now,
    staff: (db.prepare('SELECT * FROM staff ORDER BY name').all() as Row[]).map(asStaff),
    clients: (db.prepare('SELECT * FROM clients ORDER BY name').all() as Row[]).map(asClient),
    returns: (db.prepare('SELECT * FROM returns').all() as Row[]).map(asReturn),
    events: (db.prepare('SELECT * FROM stage_events ORDER BY at').all() as Row[]).map(asEvent),
    docRequests: (db.prepare('SELECT * FROM doc_requests').all() as Row[]).map(asDoc),
    reminders: (db.prepare('SELECT * FROM reminders ORDER BY sent_at').all() as Row[]).map(asReminder),
  };
}

export function getFirmName(): string {
  const db = ensureSeeded();
  const row = db.prepare('SELECT value FROM firm_settings WHERE key = ?').get('firm_name') as
    | { value: string }
    | undefined;
  return row?.value ?? 'Your Firm';
}

export function getReturnDetail(returnId: string) {
  const db = ensureSeeded();
  const ret = db.prepare('SELECT * FROM returns WHERE id = ?').get(returnId) as Row | undefined;
  if (!ret) return null;

  const mapped = asReturn(ret);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(mapped.clientId) as Row;
  const events = (
    db.prepare('SELECT * FROM stage_events WHERE return_id = ? ORDER BY at').all(returnId) as Row[]
  ).map(asEvent);
  const docs = (
    db.prepare('SELECT * FROM doc_requests WHERE return_id = ? ORDER BY status DESC, doc_type').all(returnId) as Row[]
  ).map(asDoc);
  const reminders = (
    db.prepare('SELECT * FROM reminders WHERE return_id = ? ORDER BY sent_at DESC').all(returnId) as Row[]
  ).map(asReminder);
  const staff = (db.prepare('SELECT * FROM staff').all() as Row[]).map(asStaff);

  return { ret: mapped, client: asClient(client), events, docs, reminders, staff };
}

/* ---------- writes ------------------------------------------------------- */

/**
 * Move a return to a new stage.
 *
 * The event log and the denormalized `returns.stage` are written together so
 * they can never disagree — every timing figure in the app depends on that.
 */
export function advanceStage(
  returnId: string,
  toStage: Stage,
  actorId: string | null,
  note = '',
): void {
  const db = ensureSeeded();
  const current = db.prepare('SELECT stage FROM returns WHERE id = ?').get(returnId) as
    | { stage: Stage }
    | undefined;
  if (!current) throw new Error(`No such return: ${returnId}`);
  if (current.stage === toStage) return;

  const at = new Date().toISOString();
  const isRework = current.stage === 'in_review' && toStage === 'in_prep';

  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO stage_events (id, return_id, from_stage, to_stage, at, actor_id, is_rework, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(`evt_${returnId}_${Date.now()}`, returnId, current.stage, toStage, at, actorId, isRework ? 1 : 0, note);

    db.prepare('UPDATE returns SET stage = ?, stage_entered_at = ?, extended = ? WHERE id = ?').run(
      toStage,
      at,
      toStage === 'extended' ? 1 : 0,
      returnId,
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function setDocStatus(docId: string, status: DocStatus): void {
  const db = ensureSeeded();
  db.prepare('UPDATE doc_requests SET status = ?, received_at = ? WHERE id = ?').run(
    status,
    status === 'received' ? new Date().toISOString() : null,
    docId,
  );
}

/** Log an outbound nudge and bump the reminder counters on what is still open. */
export function logReminder(
  returnId: string,
  channel: Reminder['channel'],
  sentById: string | null,
  body: string,
): void {
  const db = ensureSeeded();
  const at = new Date().toISOString();

  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO reminders (id, return_id, channel, sent_at, sent_by_id, body) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(`rem_${returnId}_${Date.now()}`, returnId, channel, at, sentById, body);

    db.prepare(
      "UPDATE doc_requests SET reminders_sent = reminders_sent + 1, last_reminder_at = ? WHERE return_id = ? AND status = 'pending'",
    ).run(at, returnId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function reseed(nowIso?: string): void {
  const db = getDb();
  seedDatabase(db, nowIso ?? new Date().toISOString());
}

/* ---------- bootstrap ---------------------------------------------------- */

/** Populate a fresh database on first use so `npm run dev` just works. */
function ensureSeeded(): DatabaseSync {
  const db = getDb();
  if (isEmpty(db)) seedDatabase(db, new Date().toISOString());
  return db;
}
