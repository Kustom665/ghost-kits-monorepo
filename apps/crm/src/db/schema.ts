/**
 * Schema for CentralFlow.
 *
 * `messages` is the table that matters. Every response-time figure in the app
 * is derived from it — the denormalised columns on `conversations` are a cache
 * rebuilt by `refreshConversation` after every write, never edited by hand, so
 * the inbox cannot drift away from the actual correspondence.
 */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS team_members (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  role                  TEXT NOT NULL,
  email                 TEXT NOT NULL,
  weekly_capacity_hours REAL NOT NULL,
  active                INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS accounts (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  tier             TEXT NOT NULL,
  retainer_monthly INTEGER NOT NULL DEFAULT 0,
  industry         TEXT NOT NULL,
  owner_id         TEXT REFERENCES team_members(id),
  started_at       TEXT NOT NULL,
  renews_at        TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  title      TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_id);

CREATE TABLE IF NOT EXISTS deals (
  id                TEXT PRIMARY KEY,
  account_id        TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  stage             TEXT NOT NULL,
  value             INTEGER NOT NULL,
  retainer_monthly  INTEGER NOT NULL DEFAULT 0,
  owner_id          TEXT REFERENCES team_members(id),
  opened_at         TEXT NOT NULL,
  stage_entered_at  TEXT NOT NULL,
  expected_close_at TEXT NOT NULL,
  closed_at         TEXT,
  lost_reason       TEXT NOT NULL DEFAULT '',
  source            TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_account ON deals(account_id);

CREATE TABLE IF NOT EXISTS deal_events (
  id         TEXT PRIMARY KEY,
  deal_id    TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage   TEXT NOT NULL,
  at         TEXT NOT NULL,
  actor_id   TEXT REFERENCES team_members(id)
);

CREATE INDEX IF NOT EXISTS idx_deal_events_deal ON deal_events(deal_id, at);

CREATE TABLE IF NOT EXISTS conversations (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id       TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  subject          TEXT NOT NULL,
  channel          TEXT NOT NULL,
  state            TEXT NOT NULL,
  assignee_id      TEXT REFERENCES team_members(id),
  opened_at        TEXT NOT NULL,
  last_message_at  TEXT NOT NULL,
  last_inbound_at  TEXT,
  last_outbound_at TEXT,
  first_response_at TEXT,
  waiting_on       TEXT NOT NULL,
  snoozed_until    TEXT,
  closed_at        TEXT,
  deal_id          TEXT REFERENCES deals(id) ON DELETE SET NULL,
  tags             TEXT NOT NULL DEFAULT '',
  message_count    INTEGER NOT NULL DEFAULT 0,
  has_draft        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_conversations_state ON conversations(state);
CREATE INDEX IF NOT EXISTS idx_conversations_account ON conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assignee ON conversations(assignee_id);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL,
  author_name     TEXT NOT NULL,
  author_id       TEXT REFERENCES team_members(id),
  sent_at         TEXT NOT NULL,
  body            TEXT NOT NULL,
  is_draft        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sent_at);

CREATE TABLE IF NOT EXISTS agency_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
