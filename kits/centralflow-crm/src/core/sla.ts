/**
 * Response commitments.
 *
 * Two clocks, not one. The *first* reply to a new thread is the one clients
 * judge you on and the one that decides whether an inbound lead ever becomes a
 * conversation at all; a reply inside an established back-and-forth is held to
 * a looser standard. Collapsing them into a single "average response time"
 * hides the only number that moves revenue.
 */

import {
  DEFAULT_WORK_WEEK,
  addBusinessHours,
  businessHoursBetween,
  clamp,
  round,
  type WorkWeek,
} from './time.ts';
import type { Account, AccountTier, Conversation } from './types.ts';

export interface ResponseTarget {
  /** Budget for the first outbound reply on a thread, in business hours. */
  firstResponseHours: number;
  /** Budget for every subsequent reply once the thread is running. */
  followUpHours: number;
}

/**
 * Prospects get the tightest first-response budget in the shop. That is not
 * favouritism — inbound lead contact rates fall off a cliff within the first
 * hour, and a prospect has no relationship to spend down while they wait.
 * Retained clients are more forgiving because they have been answered before.
 */
export const RESPONSE_TARGETS: Record<AccountTier, ResponseTarget> = {
  prospect: { firstResponseHours: 1, followUpHours: 4 },
  flagship: { firstResponseHours: 2, followUpHours: 4 },
  growth: { firstResponseHours: 4, followUpHours: 8 },
  starter: { firstResponseHours: 8, followUpHours: 16 },
};

export const TIER_META: Record<
  AccountTier,
  { label: string; rank: number; description: string }
> = {
  flagship: { label: 'Flagship', rank: 0, description: 'Top retainers — losing one reshapes the year' },
  growth: { label: 'Growth', rank: 1, description: 'Established retainers with room to expand' },
  starter: { label: 'Starter', rank: 2, description: 'Small or project-based engagements' },
  prospect: { label: 'Prospect', rank: 3, description: 'Not yet a client — speed decides the outcome' },
};

export type SlaStatus = 'clear' | 'due_soon' | 'breached' | 'not_owed';

export interface SlaAssessment {
  status: SlaStatus;
  /** True while no outbound message exists on the thread. */
  isFirstResponse: boolean;
  budgetHours: number;
  /** Working hours the client has been waiting on us. */
  owedHours: number;
  /** Working hours left before breach; negative once breached. */
  remainingHours: number;
  /** Wall-clock instant the budget runs out. */
  dueAt: string | null;
  /** 0 when untouched, 1 at the budget, >1 once over. */
  pressure: number;
}

const NOT_OWED: SlaAssessment = {
  status: 'not_owed',
  isFirstResponse: false,
  budgetHours: 0,
  owedHours: 0,
  remainingHours: 0,
  dueAt: null,
  pressure: 0,
};

/**
 * A thread owes a response when it is open and the last move was theirs.
 * Snoozed threads are deliberately parked and closed threads are finished, so
 * neither accrues time.
 */
export function owesResponse(conversation: Conversation, nowIso: string): boolean {
  if (conversation.state === 'closed') return false;
  if (conversation.state === 'snoozed') {
    if (conversation.snoozedUntil && conversation.snoozedUntil > nowIso) return false;
  }
  return conversation.waitingOn === 'us' && conversation.lastInboundAt !== null;
}

export function assessSla(
  conversation: Conversation,
  tier: AccountTier,
  nowIso: string,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): SlaAssessment {
  if (!owesResponse(conversation, nowIso)) return NOT_OWED;

  const since = conversation.lastInboundAt as string;
  const isFirstResponse = conversation.lastOutboundAt === null;
  const target = RESPONSE_TARGETS[tier];
  const budgetHours = isFirstResponse ? target.firstResponseHours : target.followUpHours;

  const owedHours = businessHoursBetween(since, nowIso, week);
  const remainingHours = budgetHours - owedHours;
  const pressure = budgetHours > 0 ? owedHours / budgetHours : 0;

  // "Due soon" is the last quarter of the budget, with a floor of half an hour
  // so a one-hour prospect budget still produces a usable warning window.
  const warnAt = Math.max(0.5, budgetHours * 0.25);

  let status: SlaStatus;
  if (remainingHours < 0) status = 'breached';
  else if (remainingHours <= warnAt) status = 'due_soon';
  else status = 'clear';

  return {
    status,
    isFirstResponse,
    budgetHours,
    owedHours: round(owedHours, 2),
    remainingHours: round(remainingHours, 2),
    dueAt: addBusinessHours(since, budgetHours, week),
    pressure: round(clamp(pressure, 0, 6), 3),
  };
}

export function assessAll(
  conversations: Conversation[],
  accounts: Account[],
  nowIso: string,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): Map<string, SlaAssessment> {
  const tierById = new Map(accounts.map((a) => [a.id, a.tier]));
  const out = new Map<string, SlaAssessment>();
  for (const conversation of conversations) {
    const tier = tierById.get(conversation.accountId) ?? 'starter';
    out.set(conversation.id, assessSla(conversation, tier, nowIso, week));
  }
  return out;
}

export interface SlaSummary {
  owed: number;
  breached: number;
  dueSoon: number;
  /** Median working hours the currently-owed threads have been waiting. */
  medianOwedHours: number;
  worstOwedHours: number;
}

export function summarizeSla(assessments: Iterable<SlaAssessment>): SlaSummary {
  let owed = 0;
  let breached = 0;
  let dueSoon = 0;
  let worst = 0;
  const owedHours: number[] = [];

  for (const a of assessments) {
    if (a.status === 'not_owed') continue;
    owed += 1;
    owedHours.push(a.owedHours);
    if (a.owedHours > worst) worst = a.owedHours;
    if (a.status === 'breached') breached += 1;
    if (a.status === 'due_soon') dueSoon += 1;
  }

  owedHours.sort((x, y) => x - y);
  const mid = Math.floor(owedHours.length / 2);
  const medianOwedHours =
    owedHours.length === 0
      ? 0
      : owedHours.length % 2 === 0
        ? (owedHours[mid - 1] + owedHours[mid]) / 2
        : owedHours[mid];

  return {
    owed,
    breached,
    dueSoon,
    medianOwedHours: round(medianOwedHours, 1),
    worstOwedHours: round(worst, 1),
  };
}

/**
 * Working hours the client waited for the first reply, or null if they are
 * still waiting. Threads still waiting are excluded from every average on
 * purpose: counting "time so far" as a response time drags the number toward
 * zero exactly when the shop is at its slowest.
 *
 * Measured from the first *inbound* message rather than from the thread's
 * first message. On a thread the agency opened as outreach those differ by
 * however long the prospect took to write back — charging that silence to our
 * response time would make the fastest replies in the shop look like the
 * slowest.
 */
export function firstResponseHours(
  conversation: Conversation,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): number | null {
  const { firstInboundAt, firstResponseAt } = conversation;
  if (!firstResponseAt || !firstInboundAt) return null;
  return businessHoursBetween(firstInboundAt, firstResponseAt, week);
}

/** Measured first-response performance over a trailing window. */
export function firstResponseSample(
  conversations: Conversation[],
  nowIso: string,
  windowDays = 30,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): number[] {
  const cutoff = new Date(new Date(nowIso).getTime() - windowDays * 86_400_000).toISOString();
  const sample: number[] = [];
  for (const conversation of conversations) {
    if (conversation.openedAt < cutoff) continue;
    const hours = firstResponseHours(conversation, week);
    if (hours !== null) sample.push(hours);
  }
  return sample;
}
