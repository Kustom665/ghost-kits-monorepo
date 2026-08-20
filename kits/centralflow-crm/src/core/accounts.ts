/**
 * Account health and team load.
 *
 * Churn in an agency is almost never a surprise from the inside — the signals
 * were all in the inbox. The account went quiet, or it did not and we were slow
 * to answer, and the renewal arrived with nobody having had the conversation.
 * This module reads those three signals off the same data the inbox already
 * has, so health is a consequence of behaviour rather than someone's gut feel
 * typed into a dropdown.
 */

import { RESPONSE_TARGETS, firstResponseHours, owesResponse, type SlaAssessment } from './sla.ts';
import {
  DEFAULT_WORK_WEEK,
  businessDaysBetween,
  businessHoursBetween,
  clamp,
  daysBetween,
  round,
  type WorkWeek,
} from './time.ts';
import type { Account, Contact, Conversation, Deal, TeamMember } from './types.ts';

export type HealthBand = 'solid' | 'watch' | 'at_risk';

export interface AccountHealth {
  account: Account;
  score: number;
  band: HealthBand;
  /** Threads this account is waiting on us for right now. */
  owedThreads: number;
  breachedThreads: number;
  worstOwedHours: number;
  /** Working days since anyone at the account wrote in. */
  quietDays: number;
  /** Share of this account's recent threads answered inside the target. */
  onTimeRate: number;
  answeredSample: number;
  daysToRenewal: number | null;
  openDealValue: number;
  reasons: string[];
}

const BAND_CUTOFFS: Array<[HealthBand, number]> = [
  ['solid', 70],
  ['watch', 45],
];

export function bandFor(score: number): HealthBand {
  for (const [band, cutoff] of BAND_CUTOFFS) if (score >= cutoff) return band;
  return 'at_risk';
}

/**
 * Silence tolerance scales with the size of the engagement. A flagship client
 * that has not written in two weeks is a fire; a starter account on a light
 * retainer legitimately goes quiet between projects.
 */
function quietToleranceDays(account: Account): number {
  switch (account.tier) {
    case 'flagship':
      return 5;
    case 'growth':
      return 10;
    case 'starter':
      return 20;
    case 'prospect':
      return 4;
  }
}

export function assessAccountHealth(
  account: Account,
  conversations: Conversation[],
  deals: Deal[],
  slaByConversation: Map<string, SlaAssessment>,
  nowIso: string,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): AccountHealth {
  const mine = conversations.filter((c) => c.accountId === account.id);
  const target = RESPONSE_TARGETS[account.tier];
  const reasons: string[] = [];

  let owedThreads = 0;
  let breachedThreads = 0;
  let worstOwedHours = 0;
  let lastInboundAt: string | null = null;

  for (const conversation of mine) {
    if (conversation.lastInboundAt && (!lastInboundAt || conversation.lastInboundAt > lastInboundAt)) {
      lastInboundAt = conversation.lastInboundAt;
    }
    if (!owesResponse(conversation, nowIso)) continue;
    owedThreads += 1;
    const sla = slaByConversation.get(conversation.id);
    if (!sla) continue;
    if (sla.status === 'breached') breachedThreads += 1;
    if (sla.owedHours > worstOwedHours) worstOwedHours = sla.owedHours;
  }

  // Answered history: threads that did get a first reply, scored against the
  // budget that applied to them. Threads still waiting are counted above as
  // current debt instead — putting them in both places would double-charge.
  let answered = 0;
  let onTime = 0;
  for (const conversation of mine) {
    const hours = firstResponseHours(conversation, week);
    if (hours === null) continue;
    answered += 1;
    if (hours <= target.firstResponseHours) onTime += 1;
  }
  const onTimeRate = answered > 0 ? onTime / answered : 1;

  const quietDays = lastInboundAt ? businessDaysBetween(lastInboundAt, nowIso, week) : 90;
  const tolerance = quietToleranceDays(account);

  const openDeals = deals.filter((d) => d.accountId === account.id && (d.stage === 'lead' || d.stage === 'qualified' || d.stage === 'proposal' || d.stage === 'negotiation'));
  const openDealValue = openDeals.reduce((sum, d) => sum + d.value, 0);

  const daysToRenewal = account.renewsAt ? Math.round(daysBetween(nowIso, account.renewsAt)) : null;

  // Start at full health and subtract evidence. Each deduction is capped so one
  // bad signal cannot alone drive an otherwise healthy account to zero.
  let score = 100;

  if (breachedThreads > 0) {
    const penalty = clamp(breachedThreads * 12 + worstOwedHours * 0.8, 0, 34);
    score -= penalty;
    reasons.push(
      `${breachedThreads} thread${breachedThreads === 1 ? '' : 's'} past the response target, worst at ${round(worstOwedHours, 1)}h`,
    );
  } else if (owedThreads > 0) {
    score -= clamp(owedThreads * 4, 0, 10);
  }

  if (quietDays > tolerance) {
    const penalty = clamp(((quietDays - tolerance) / tolerance) * 18, 0, 26);
    score -= penalty;
    reasons.push(`No inbound for ${Math.round(quietDays)} working days (usual gap under ${tolerance})`);
  }

  if (onTimeRate < 0.8 && answered >= 3) {
    const penalty = clamp((0.8 - onTimeRate) * 60, 0, 22);
    score -= penalty;
    const missed = answered - onTime;
    reasons.push(
      `${missed} of the last ${answered} first replies missed the ${target.firstResponseHours}h target`,
    );
  }

  if (daysToRenewal !== null && daysToRenewal <= 60 && daysToRenewal >= 0) {
    score -= daysToRenewal <= 30 ? 10 : 5;
    reasons.push(`Renews in ${daysToRenewal} days`);
  }

  if (openDealValue > 0) {
    // Live expansion work is a genuine positive signal — the client is still
    // buying — but a small one, and it never offsets a breach.
    score += clamp(openDealValue / 10_000, 0, 6);
    reasons.push(`$${openDealValue.toLocaleString('en-US')} of open expansion work`);
  }

  score = round(clamp(score, 0, 100), 1);

  return {
    account,
    score,
    band: bandFor(score),
    owedThreads,
    breachedThreads,
    worstOwedHours: round(worstOwedHours, 1),
    quietDays: round(quietDays, 1),
    onTimeRate: round(onTimeRate, 3),
    answeredSample: answered,
    daysToRenewal,
    openDealValue,
    reasons,
  };
}

export function rankAccountHealth(
  accounts: Account[],
  conversations: Conversation[],
  deals: Deal[],
  slaByConversation: Map<string, SlaAssessment>,
  nowIso: string,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): AccountHealth[] {
  return accounts
    .map((a) => assessAccountHealth(a, conversations, deals, slaByConversation, nowIso, week))
    .sort((a, b) => a.score - b.score || b.account.retainerMonthly - a.account.retainerMonthly);
}

export interface MemberLoad {
  member: TeamMember;
  openThreads: number;
  owedThreads: number;
  breachedThreads: number;
  /** Working hours the oldest unanswered thread has been waiting. */
  oldestOwedHours: number;
  accounts: number;
}

/**
 * Per-person queue. A shop-wide breach count usually resolves to one or two
 * people underwater, and the fix for that is redistribution, not a policy.
 */
export function buildTeamLoad(
  team: TeamMember[],
  conversations: Conversation[],
  slaByConversation: Map<string, SlaAssessment>,
  nowIso: string,
): MemberLoad[] {
  const byMember = new Map<string, MemberLoad>();
  for (const member of team) {
    byMember.set(member.id, {
      member,
      openThreads: 0,
      owedThreads: 0,
      breachedThreads: 0,
      oldestOwedHours: 0,
      accounts: 0,
    });
  }

  const accountSets = new Map<string, Set<string>>();

  for (const conversation of conversations) {
    if (conversation.state === 'closed' || !conversation.assigneeId) continue;
    const load = byMember.get(conversation.assigneeId);
    if (!load) continue;
    load.openThreads += 1;

    const set = accountSets.get(conversation.assigneeId) ?? new Set<string>();
    set.add(conversation.accountId);
    accountSets.set(conversation.assigneeId, set);

    if (!owesResponse(conversation, nowIso)) continue;
    load.owedThreads += 1;
    const sla = slaByConversation.get(conversation.id);
    if (!sla) continue;
    if (sla.status === 'breached') load.breachedThreads += 1;
    if (sla.owedHours > load.oldestOwedHours) load.oldestOwedHours = round(sla.owedHours, 1);
  }

  for (const [memberId, set] of accountSets) {
    const load = byMember.get(memberId);
    if (load) load.accounts = set.size;
  }

  return [...byMember.values()].sort((a, b) => b.breachedThreads - a.breachedThreads || b.owedThreads - a.owedThreads);
}

/**
 * A first-draft reply for the composer. It is intentionally plain and
 * specific — it names the thread and the wait, and it stops before promising
 * anything the sender has not decided yet. Anything more elaborate gets deleted
 * and retyped, which is worse than no draft at all.
 */
export function draftReply(
  conversation: Conversation,
  contact: Contact | null,
  sender: TeamMember | null,
  sla: SlaAssessment,
  nowIso: string,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): string {
  const firstName = (contact?.name ?? 'there').split(' ')[0];
  const lines: string[] = [`Hi ${firstName},`, ''];

  const waited = conversation.lastInboundAt
    ? businessHoursBetween(conversation.lastInboundAt, nowIso, week)
    : 0;

  if (sla.status === 'breached') {
    lines.push(
      `Apologies for the slow reply on "${conversation.subject}" — that sat longer than it should have.`,
    );
  } else if (waited >= 1) {
    lines.push(`Thanks for the note on "${conversation.subject}".`);
  } else {
    lines.push(`Thanks for getting in touch about "${conversation.subject}".`);
  }

  lines.push('');
  lines.push('[Your answer here.]');
  lines.push('');
  lines.push("I'll follow up with next steps and a date by end of day.");
  lines.push('');
  lines.push(sender ? `— ${sender.name}` : '—');

  return lines.join('\n');
}
