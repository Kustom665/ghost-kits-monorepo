/**
 * Inbox triage — the one question the shared inbox has to answer:
 * of the forty threads sitting here, which one do I open first?
 *
 * Sorting by arrival time is what every mail client does and it is wrong for a
 * client-services business: it ranks a newsletter reply from a $900/mo starter
 * account above a flagship client who has been waiting since Tuesday. The score
 * below is deliberately explainable — every point it adds comes back out as a
 * sentence, because a ranking nobody can interrogate is a ranking nobody
 * follows.
 */

import { assessSla, owesResponse, type SlaAssessment, type SlaStatus } from './sla.ts';
import {
  DEFAULT_WORK_WEEK,
  businessHoursBetween,
  clamp,
  round,
  type WorkWeek,
} from './time.ts';
import type { Account, Contact, Conversation, Deal } from './types.ts';

/** Tags that mean the relationship itself is in play, not just the task. */
export const ESCALATION_TAGS = ['churn-risk', 'complaint', 'escalation', 'invoice'];

export interface TriageItem {
  conversation: Conversation;
  account: Account;
  contact: Contact | null;
  deal: Deal | null;
  sla: SlaAssessment;
  score: number;
  reasons: string[];
  /** Waiting time in working hours, whether or not the SLA clock applies. */
  quietHours: number;
}

export interface TriageWeights {
  sla: number;
  value: number;
  unassigned: number;
  deal: number;
  escalation: number;
  firstTouch: number;
}

export const DEFAULT_WEIGHTS: TriageWeights = {
  sla: 46,
  value: 20,
  unassigned: 12,
  deal: 14,
  escalation: 8,
  firstTouch: 6,
};

/**
 * Retainer value on a 0-1 curve. Deliberately compressive: a $20k/mo flagship
 * matters more than a $2k/mo starter, but not ten times more — the inbox still
 * has to answer the small accounts or they churn, and a linear weight would
 * bury them permanently.
 */
function valueWeight(retainerMonthly: number, dealValue: number): number {
  const monthly = Math.max(retainerMonthly, dealValue / 12);
  if (monthly <= 0) return 0.25;
  return clamp(Math.log10(1 + monthly / 500) / Math.log10(1 + 40), 0, 1);
}

/** Open deals late in the funnel are the most expensive silence in the shop. */
function dealWeight(deal: Deal | null): number {
  if (!deal) return 0;
  switch (deal.stage) {
    case 'negotiation':
      return 1;
    case 'proposal':
      return 0.85;
    case 'qualified':
      return 0.5;
    case 'lead':
      return 0.3;
    default:
      return 0;
  }
}

export function scoreConversation(
  conversation: Conversation,
  account: Account,
  contact: Contact | null,
  deal: Deal | null,
  nowIso: string,
  weights: TriageWeights = DEFAULT_WEIGHTS,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): TriageItem {
  const sla = assessSla(conversation, account.tier, nowIso, week);
  const reasons: string[] = [];

  const since = conversation.lastInboundAt ?? conversation.lastMessageAt;
  const quietHours = businessHoursBetween(since, nowIso, week);

  // SLA pressure saturates just past 2x the budget. Past that point the thread
  // is already the worst kind of late, and letting it climb forever would let
  // one ancient thread pin the top of the list for a week.
  const slaComponent = weights.sla * clamp(sla.pressure / 2, 0, 1);
  if (sla.status === 'breached') {
    reasons.push(
      `${sla.isFirstResponse ? 'First reply' : 'Reply'} is ${round(-sla.remainingHours, 1)}h past the ${sla.budgetHours}h target`,
    );
  } else if (sla.status === 'due_soon') {
    reasons.push(`${round(sla.remainingHours, 1)}h left on the ${sla.budgetHours}h target`);
  }

  const value = valueWeight(account.retainerMonthly, deal?.value ?? 0);
  const valueComponent = weights.value * value;
  if (account.tier === 'flagship') {
    reasons.push(`Flagship account — $${(account.retainerMonthly / 1000).toFixed(1)}k/mo`);
  } else if (account.tier === 'prospect') {
    reasons.push('Prospect — speed to first reply decides this one');
  }

  const isUnassigned = conversation.assigneeId === null;
  const unassignedComponent =
    isUnassigned && owesResponse(conversation, nowIso)
      ? weights.unassigned * clamp(quietHours / 8, 0.35, 1)
      : 0;
  if (isUnassigned && owesResponse(conversation, nowIso)) {
    reasons.push('Nobody owns this thread yet');
  }

  const dealComponent = weights.deal * dealWeight(deal);
  if (deal && dealWeight(deal) > 0) {
    reasons.push(`Live ${deal.stage} deal — $${deal.value.toLocaleString('en-US')}`);
  }

  const escalated = conversation.tags.some((t) => ESCALATION_TAGS.includes(t));
  const escalationComponent = escalated ? weights.escalation : 0;
  if (escalated) {
    const tag = conversation.tags.find((t) => ESCALATION_TAGS.includes(t));
    reasons.push(`Tagged ${tag}`);
  }

  const firstTouchComponent = sla.isFirstResponse && sla.status !== 'not_owed' ? weights.firstTouch : 0;
  if (sla.isFirstResponse && sla.status !== 'not_owed') {
    reasons.push('Nobody has replied to this thread at all');
  }

  if (contact?.isPrimary && owesResponse(conversation, nowIso)) {
    reasons.push(`${contact.name} is the primary contact`);
  }

  const score =
    slaComponent +
    valueComponent +
    unassignedComponent +
    dealComponent +
    escalationComponent +
    firstTouchComponent;

  return {
    conversation,
    account,
    contact,
    deal,
    sla,
    score: round(score, 2),
    reasons,
    quietHours: round(quietHours, 1),
  };
}

export function buildTriage(
  conversations: Conversation[],
  accounts: Account[],
  contacts: Contact[],
  deals: Deal[],
  nowIso: string,
  weights: TriageWeights = DEFAULT_WEIGHTS,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): TriageItem[] {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const dealById = new Map(deals.map((d) => [d.id, d]));

  const items: TriageItem[] = [];
  for (const conversation of conversations) {
    const account = accountById.get(conversation.accountId);
    if (!account) continue;
    const deal = conversation.dealId ? (dealById.get(conversation.dealId) ?? null) : null;
    items.push(
      scoreConversation(
        conversation,
        account,
        contactById.get(conversation.contactId) ?? null,
        deal,
        nowIso,
        weights,
        week,
      ),
    );
  }

  return items.sort((a, b) => b.score - a.score || a.conversation.lastMessageAt.localeCompare(b.conversation.lastMessageAt));
}

export type Folder =
  | 'inbox'
  | 'mine'
  | 'unassigned'
  | 'drafts'
  | 'snoozed'
  | 'closed'
  | 'all';

export const FOLDER_META: Record<Folder, { label: string; hint: string }> = {
  inbox: { label: 'Inbox', hint: 'Open threads across the whole shop' },
  mine: { label: 'Assigned to me', hint: 'Threads you own' },
  unassigned: { label: 'Unassigned', hint: 'Nobody has picked these up' },
  drafts: { label: 'Drafts', hint: 'Replies written but not sent' },
  snoozed: { label: 'Snoozed', hint: 'Parked until a date' },
  closed: { label: 'Closed', hint: 'Resolved threads' },
  all: { label: 'All', hint: 'Everything, including closed' },
};

/** A snoozed thread whose date has passed is back in the inbox, not hidden. */
export function isAwake(conversation: Conversation, nowIso: string): boolean {
  if (conversation.state !== 'snoozed') return true;
  return conversation.snoozedUntil === null || conversation.snoozedUntil <= nowIso;
}

export function inFolder(
  conversation: Conversation,
  folder: Folder,
  nowIso: string,
  viewerId: string | null,
): boolean {
  const awake = isAwake(conversation, nowIso);
  switch (folder) {
    case 'inbox':
      return conversation.state !== 'closed' && awake;
    case 'mine':
      return conversation.state !== 'closed' && awake && conversation.assigneeId === viewerId;
    case 'unassigned':
      return conversation.state !== 'closed' && awake && conversation.assigneeId === null;
    case 'drafts':
      return conversation.hasDraft && conversation.state !== 'closed';
    case 'snoozed':
      return conversation.state === 'snoozed' && !awake;
    case 'closed':
      return conversation.state === 'closed';
    case 'all':
      return true;
  }
}

export type StatusFilter = 'all' | 'waiting_on_us' | 'waiting_on_them' | 'breached';

export function matchesStatus(
  item: TriageItem,
  filter: StatusFilter,
  nowIso: string,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'waiting_on_us':
      return owesResponse(item.conversation, nowIso);
    case 'waiting_on_them':
      return item.conversation.waitingOn === 'them';
    case 'breached':
      return item.sla.status === 'breached';
  }
}

export interface FolderCounts {
  inbox: number;
  mine: number;
  unassigned: number;
  drafts: number;
  snoozed: number;
  closed: number;
  all: number;
}

export function countFolders(
  conversations: Conversation[],
  nowIso: string,
  viewerId: string | null,
): FolderCounts {
  const counts: FolderCounts = {
    inbox: 0, mine: 0, unassigned: 0, drafts: 0, snoozed: 0, closed: 0, all: 0,
  };
  for (const c of conversations) {
    for (const folder of Object.keys(counts) as Folder[]) {
      if (inFolder(c, folder, nowIso, viewerId)) counts[folder as keyof FolderCounts] += 1;
    }
  }
  return counts;
}

export type SlaBucket = Record<SlaStatus, number>;

export function bucketBySla(items: TriageItem[]): SlaBucket {
  const buckets: SlaBucket = { clear: 0, due_soon: 0, breached: 0, not_owed: 0 };
  for (const item of items) buckets[item.sla.status] += 1;
  return buckets;
}
