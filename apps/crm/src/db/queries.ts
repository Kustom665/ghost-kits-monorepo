import type { DatabaseSync } from 'node:sqlite';
import type {
  Account,
  AgencySnapshot,
  Contact,
  Conversation,
  Deal,
  DealEvent,
  DealStage,
  Message,
  TeamMember,
} from '@agency/core';
import { getDb, isEmpty } from './client.ts';
import { refreshConversation, seedDatabase } from './seed.ts';

/**
 * Read models load the whole working set once per request and hand it to
 * `@agency/core`. The corpus is a few thousand rows — an agency's inbox, not a
 * warehouse — so paying for clarity here is the right trade, and it keeps every
 * ranking decision in tested, framework-free code.
 */

function ready(): DatabaseSync {
  const db = getDb();
  if (isEmpty(db)) seedDatabase(db, new Date().toISOString());
  return db;
}

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? '');
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return value === null || value === undefined ? null : String(value);
}

function num(row: Row, key: string): number {
  return Number(row[key] ?? 0);
}

function toTeamMember(row: Row): TeamMember {
  return {
    id: str(row, 'id'),
    name: str(row, 'name'),
    role: str(row, 'role') as TeamMember['role'],
    email: str(row, 'email'),
    weeklyCapacityHours: num(row, 'weekly_capacity_hours'),
    active: num(row, 'active') === 1,
  };
}

function toAccount(row: Row): Account {
  return {
    id: str(row, 'id'),
    name: str(row, 'name'),
    tier: str(row, 'tier') as Account['tier'],
    retainerMonthly: num(row, 'retainer_monthly'),
    industry: str(row, 'industry'),
    ownerId: nullableStr(row, 'owner_id'),
    startedAt: str(row, 'started_at'),
    renewsAt: nullableStr(row, 'renews_at'),
  };
}

function toContact(row: Row): Contact {
  return {
    id: str(row, 'id'),
    accountId: str(row, 'account_id'),
    name: str(row, 'name'),
    email: str(row, 'email'),
    title: str(row, 'title'),
    isPrimary: num(row, 'is_primary') === 1,
  };
}

function toConversation(row: Row): Conversation {
  const tags = str(row, 'tags');
  return {
    id: str(row, 'id'),
    accountId: str(row, 'account_id'),
    contactId: str(row, 'contact_id'),
    subject: str(row, 'subject'),
    channel: str(row, 'channel') as Conversation['channel'],
    state: str(row, 'state') as Conversation['state'],
    assigneeId: nullableStr(row, 'assignee_id'),
    openedAt: str(row, 'opened_at'),
    lastMessageAt: str(row, 'last_message_at'),
    lastInboundAt: nullableStr(row, 'last_inbound_at'),
    lastOutboundAt: nullableStr(row, 'last_outbound_at'),
    firstResponseAt: nullableStr(row, 'first_response_at'),
    waitingOn: str(row, 'waiting_on') as Conversation['waitingOn'],
    snoozedUntil: nullableStr(row, 'snoozed_until'),
    closedAt: nullableStr(row, 'closed_at'),
    dealId: nullableStr(row, 'deal_id'),
    tags: tags ? tags.split(',').filter(Boolean) : [],
    messageCount: num(row, 'message_count'),
    hasDraft: num(row, 'has_draft') === 1,
  };
}

function toDeal(row: Row): Deal {
  return {
    id: str(row, 'id'),
    accountId: str(row, 'account_id'),
    name: str(row, 'name'),
    stage: str(row, 'stage') as DealStage,
    value: num(row, 'value'),
    retainerMonthly: num(row, 'retainer_monthly'),
    ownerId: nullableStr(row, 'owner_id'),
    openedAt: str(row, 'opened_at'),
    stageEnteredAt: str(row, 'stage_entered_at'),
    expectedCloseAt: str(row, 'expected_close_at'),
    closedAt: nullableStr(row, 'closed_at'),
    lostReason: str(row, 'lost_reason'),
    source: str(row, 'source'),
  };
}

function toDealEvent(row: Row): DealEvent {
  return {
    id: str(row, 'id'),
    dealId: str(row, 'deal_id'),
    fromStage: nullableStr(row, 'from_stage') as DealStage | null,
    toStage: str(row, 'to_stage') as DealStage,
    at: str(row, 'at'),
    actorId: nullableStr(row, 'actor_id'),
  };
}

function toMessage(row: Row): Message {
  return {
    id: str(row, 'id'),
    conversationId: str(row, 'conversation_id'),
    direction: str(row, 'direction') as Message['direction'],
    authorName: str(row, 'author_name'),
    authorId: nullableStr(row, 'author_id'),
    sentAt: str(row, 'sent_at'),
    body: str(row, 'body'),
    isDraft: num(row, 'is_draft') === 1,
  };
}

export function loadSnapshot(nowIso = new Date().toISOString()): AgencySnapshot {
  const db = ready();
  return {
    now: nowIso,
    team: (db.prepare('SELECT * FROM team_members ORDER BY name').all() as Row[]).map(toTeamMember),
    accounts: (db.prepare('SELECT * FROM accounts ORDER BY retainer_monthly DESC, name').all() as Row[]).map(toAccount),
    contacts: (db.prepare('SELECT * FROM contacts').all() as Row[]).map(toContact),
    conversations: (db.prepare('SELECT * FROM conversations').all() as Row[]).map(toConversation),
    deals: (db.prepare('SELECT * FROM deals').all() as Row[]).map(toDeal),
    dealEvents: (db.prepare('SELECT * FROM deal_events ORDER BY at').all() as Row[]).map(toDealEvent),
  };
}

export function getConversation(id: string): Conversation | null {
  const row = ready().prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Row | undefined;
  return row ? toConversation(row) : null;
}

export function getMessages(conversationId: string): Message[] {
  return (
    ready()
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY sent_at, id')
      .all(conversationId) as Row[]
  ).map(toMessage);
}

export interface Snippet {
  body: string;
  direction: 'inbound' | 'outbound';
  authorName: string;
}

/**
 * The last sent message on every thread, for the inbox preview line. One query
 * for the whole list — the alternative is a query per row, which is how an
 * inbox ends up taking a second to paint.
 */
export function getSnippets(): Map<string, Snippet> {
  const rows = ready()
    .prepare(
      `SELECT m.conversation_id, m.body, m.direction, m.author_name
         FROM messages m
         JOIN (
           SELECT conversation_id, MAX(sent_at) AS latest
             FROM messages WHERE is_draft = 0
            GROUP BY conversation_id
         ) last
           ON last.conversation_id = m.conversation_id AND last.latest = m.sent_at
        WHERE m.is_draft = 0
        GROUP BY m.conversation_id`,
    )
    .all() as Row[];

  const out = new Map<string, Snippet>();
  for (const row of rows) {
    out.set(str(row, 'conversation_id'), {
      body: str(row, 'body'),
      direction: str(row, 'direction') as Snippet['direction'],
      authorName: str(row, 'author_name'),
    });
  }
  return out;
}

export function getAccount(id: string): Account | null {
  const row = ready().prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Row | undefined;
  return row ? toAccount(row) : null;
}

export function getSetting(key: string, fallback = ''): string {
  const row = ready().prepare('SELECT value FROM agency_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}

export function getAgencyName(): string {
  return getSetting('agency_name', 'CentralFlow');
}

/**
 * The signed-in user. Authentication is out of scope for this build, so the
 * viewer is a setting — but every read path takes it as a parameter rather than
 * reaching for a global, which is what makes adding real auth a small change.
 */
export function getViewerId(): string {
  return getSetting('viewer_id', 'tm_priya');
}

// ---- Writes ---------------------------------------------------------------

export function assignConversation(conversationId: string, assigneeId: string | null): void {
  ready().prepare('UPDATE conversations SET assignee_id = ? WHERE id = ?').run(assigneeId, conversationId);
}

export function setConversationState(
  conversationId: string,
  state: 'open' | 'snoozed' | 'closed',
  snoozedUntil: string | null,
  nowIso = new Date().toISOString(),
): void {
  const db = ready();
  db.prepare(
    `UPDATE conversations
        SET state = ?, snoozed_until = ?, closed_at = CASE WHEN ? = 'closed' THEN ? ELSE NULL END
      WHERE id = ?`,
  ).run(state, state === 'snoozed' ? snoozedUntil : null, state, nowIso, conversationId);

  // Closing or reopening changes who is considered blocked, and that is derived
  // rather than stored, so the cache has to be rebuilt.
  refreshConversation(db, conversationId);
}

export function saveDraft(conversationId: string, body: string, authorId: string | null, nowIso = new Date().toISOString()): void {
  const db = ready();
  const author = authorId
    ? (db.prepare('SELECT name FROM team_members WHERE id = ?').get(authorId) as { name: string } | undefined)
    : undefined;

  db.prepare('DELETE FROM messages WHERE conversation_id = ? AND is_draft = 1').run(conversationId);
  if (body.trim().length > 0) {
    db.prepare(
      `INSERT INTO messages (id, conversation_id, direction, author_name, author_id, sent_at, body, is_draft)
       VALUES (?, ?, 'outbound', ?, ?, ?, ?, 1)`,
    ).run(`msg_draft_${conversationId}`, conversationId, author?.name ?? 'You', authorId, nowIso, body);
  }
  refreshConversation(db, conversationId);
}

/**
 * Records an outbound reply. There is no mail provider wired up — the thread is
 * the system of record either way, and connecting a sender is a swap of this
 * one function rather than a change to anything that reads.
 */
export function sendReply(
  conversationId: string,
  body: string,
  authorId: string | null,
  nowIso = new Date().toISOString(),
): void {
  const db = ready();
  const author = authorId
    ? (db.prepare('SELECT name FROM team_members WHERE id = ?').get(authorId) as { name: string } | undefined)
    : undefined;

  const count = (
    db.prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?').get(conversationId) as { n: number }
  ).n;

  db.prepare('DELETE FROM messages WHERE conversation_id = ? AND is_draft = 1').run(conversationId);
  db.prepare(
    `INSERT INTO messages (id, conversation_id, direction, author_name, author_id, sent_at, body, is_draft)
     VALUES (?, ?, 'outbound', ?, ?, ?, ?, 0)`,
  ).run(`msg_${conversationId}_${count}`, conversationId, author?.name ?? 'You', authorId, nowIso, body);

  // Replying wakes a snoozed thread — a parked thread you just answered is
  // simply an open thread.
  db.prepare(
    `UPDATE conversations SET state = CASE WHEN state = 'snoozed' THEN 'open' ELSE state END,
                              snoozed_until = CASE WHEN state = 'snoozed' THEN NULL ELSE snoozed_until END
      WHERE id = ?`,
  ).run(conversationId);

  refreshConversation(db, conversationId);
}

export function moveDealStage(
  dealId: string,
  toStage: DealStage,
  actorId: string | null,
  nowIso = new Date().toISOString(),
): void {
  const db = ready();
  const deal = db.prepare('SELECT stage FROM deals WHERE id = ?').get(dealId) as { stage: string } | undefined;
  if (!deal) throw new Error(`Unknown deal: ${dealId}`);
  if (deal.stage === toStage) return;

  const closed = toStage === 'won' || toStage === 'lost';
  db.prepare(
    `UPDATE deals SET stage = ?, stage_entered_at = ?, closed_at = ? WHERE id = ?`,
  ).run(toStage, nowIso, closed ? nowIso : null, dealId);

  const nextId = (
    db.prepare('SELECT COUNT(*) AS n FROM deal_events').get() as { n: number }
  ).n;
  db.prepare(
    `INSERT INTO deal_events (id, deal_id, from_stage, to_stage, at, actor_id) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(`de_live_${nextId}_${dealId}`, dealId, deal.stage, toStage, nowIso, actorId);
}

export function reseed(nowIso = new Date().toISOString()): void {
  seedDatabase(getDb(), nowIso);
}
