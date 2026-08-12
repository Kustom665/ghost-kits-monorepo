/**
 * Domain types for TaxFlow Radar.
 *
 * Everything here is plain data. No database, no framework, no I/O — so the
 * same types and the analytics built on them can be reused by a web client,
 * a React Native client, or a nightly batch job.
 */

/** The stages a tax return moves through, in pipeline order. */
export const STAGES = [
  'intake',
  'docs_pending',
  'ready_for_prep',
  'in_prep',
  'review_queue',
  'in_review',
  'partner_signoff',
  'client_signature',
  'efile',
  'accepted',
  'extended',
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * How a stage consumes time. This distinction drives the whole product: a
 * queue is fixed with capacity, a client_wait is fixed with follow-up, and
 * active work is fixed with training or scope control. Treating them the
 * same is why most firms misdiagnose their busy season.
 */
export type StageKind = 'queue' | 'active' | 'client_wait' | 'terminal';

export interface StageMeta {
  stage: Stage;
  label: string;
  kind: StageKind;
  /** Target days a return should spend here. Breaching this is a signal. */
  slaDays: number;
  /** Who is on the hook while a return sits here. */
  owner: 'firm' | 'client';
  description: string;
}

export type EntityType = '1040' | '1120S' | '1065' | '1120' | '1041' | '990';

export type StaffRole = 'preparer' | 'reviewer' | 'partner' | 'admin';

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  /** Hours per week this person can put against returns during busy season. */
  weeklyCapacityHours: number;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  entityType: EntityType;
  /** Clients who were painful last year are usually painful again. */
  responsivenessScore: number; // 0-100, higher is more responsive
  email: string;
  phone: string;
}

export interface TaxReturn {
  id: string;
  clientId: string;
  taxYear: number;
  entityType: EntityType;
  stage: Stage;
  /** When the return entered its current stage. Drives all aging math. */
  stageEnteredAt: string; // ISO
  createdAt: string; // ISO
  /** Statutory or internal due date this return is being driven toward. */
  dueDate: string; // ISO
  preparerId: string | null;
  reviewerId: string | null;
  partnerId: string | null;
  /** Budgeted hours — used for capacity math, not billing. */
  estimatedHours: number;
  complexity: 'simple' | 'moderate' | 'complex';
  /** Prior year fee, used to rank what is worth chasing first. */
  priorYearFee: number;
  extended: boolean;
  notes: string;
}

export interface StageEvent {
  id: string;
  returnId: string;
  fromStage: Stage | null;
  toStage: Stage;
  at: string; // ISO
  actorId: string | null;
  /** Set when a reviewer kicked a return back to the preparer. */
  isRework: boolean;
  note: string;
}

export type DocStatus = 'pending' | 'received' | 'not_applicable';

export interface DocRequest {
  id: string;
  returnId: string;
  /** e.g. "W-2", "1099-INT", "K-1 (Partnership)", "1098 Mortgage Interest" */
  docType: string;
  status: DocStatus;
  /** True when this was auto-created by rolling forward last year's return. */
  rolledForward: boolean;
  requestedAt: string; // ISO
  receivedAt: string | null; // ISO
  remindersSent: number;
  lastReminderAt: string | null; // ISO
}

/** A logged outbound nudge to a client. */
export interface Reminder {
  id: string;
  returnId: string;
  channel: 'email' | 'sms' | 'call' | 'portal';
  sentAt: string; // ISO
  sentById: string | null;
  body: string;
}

/** Everything the analytics layer needs, in one bag. */
export interface FirmSnapshot {
  now: string; // ISO
  staff: Staff[];
  clients: Client[];
  returns: TaxReturn[];
  events: StageEvent[];
  docRequests: DocRequest[];
  reminders: Reminder[];
}
