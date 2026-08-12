/**
 * Schema for the TaxFlow Radar store.
 *
 * `stage_events` is the important table. Every other timing figure in the app
 * is derived from it rather than stored, so the numbers cannot drift away from
 * what actually happened to a return.
 */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS staff (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  role                 TEXT NOT NULL,
  weekly_capacity_hours REAL NOT NULL,
  active               INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS clients (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  entity_type           TEXT NOT NULL,
  responsiveness_score  INTEGER NOT NULL,
  email                 TEXT NOT NULL,
  phone                 TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS returns (
  id               TEXT PRIMARY KEY,
  client_id        TEXT NOT NULL REFERENCES clients(id),
  tax_year         INTEGER NOT NULL,
  entity_type      TEXT NOT NULL,
  stage            TEXT NOT NULL,
  stage_entered_at TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  due_date         TEXT NOT NULL,
  preparer_id      TEXT REFERENCES staff(id),
  reviewer_id      TEXT REFERENCES staff(id),
  partner_id       TEXT REFERENCES staff(id),
  estimated_hours  REAL NOT NULL,
  complexity       TEXT NOT NULL,
  prior_year_fee   REAL NOT NULL,
  extended         INTEGER NOT NULL DEFAULT 0,
  notes            TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_returns_stage ON returns(stage);
CREATE INDEX IF NOT EXISTS idx_returns_client ON returns(client_id);

CREATE TABLE IF NOT EXISTS stage_events (
  id         TEXT PRIMARY KEY,
  return_id  TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage   TEXT NOT NULL,
  at         TEXT NOT NULL,
  actor_id   TEXT REFERENCES staff(id),
  is_rework  INTEGER NOT NULL DEFAULT 0,
  note       TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_events_return ON stage_events(return_id, at);
CREATE INDEX IF NOT EXISTS idx_events_at ON stage_events(at);

CREATE TABLE IF NOT EXISTS doc_requests (
  id              TEXT PRIMARY KEY,
  return_id       TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  doc_type        TEXT NOT NULL,
  status          TEXT NOT NULL,
  rolled_forward  INTEGER NOT NULL DEFAULT 0,
  requested_at    TEXT NOT NULL,
  received_at     TEXT,
  reminders_sent  INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_docs_return ON doc_requests(return_id);
CREATE INDEX IF NOT EXISTS idx_docs_status ON doc_requests(status);

CREATE TABLE IF NOT EXISTS reminders (
  id          TEXT PRIMARY KEY,
  return_id   TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,
  sent_at     TEXT NOT NULL,
  sent_by_id  TEXT REFERENCES staff(id),
  body        TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_reminders_return ON reminders(return_id, sent_at);

CREATE TABLE IF NOT EXISTS firm_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
