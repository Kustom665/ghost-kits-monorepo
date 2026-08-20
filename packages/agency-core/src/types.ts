/**
 * Domain model for CentralFlow — a shared-inbox CRM for a client-services
 * agency.
 *
 * The organising idea: an agency does not lose accounts because it lacks a
 * pipeline board. It loses them because a client wrote in on Thursday and
 * nobody answered until Tuesday. So the inbox is the CRM, and every other
 * object hangs off the conversation.
 */

export type Channel = 'email' | 'chat' | 'sms' | 'form';

export type ConversationState = 'open' | 'snoozed' | 'closed';

/**
 * Who the thread is blocked on. Only `us` accrues SLA time — a thread waiting
 * on the client is not the agency being slow, and counting it as such is how
 * response dashboards end up meaningless.
 */
export type WaitingOn = 'us' | 'them' | 'nobody';

export type AccountTier = 'flagship' | 'growth' | 'starter' | 'prospect';

export type TeamRole =
  | 'principal'
  | 'account_manager'
  | 'strategist'
  | 'designer'
  | 'developer';

export interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
  email: string;
  /** Hours a week this person can realistically spend on client comms + work. */
  weeklyCapacityHours: number;
  active: boolean;
}

export interface Account {
  id: string;
  name: string;
  tier: AccountTier;
  /** Recurring monthly retainer in whole dollars. Zero for prospects. */
  retainerMonthly: number;
  industry: string;
  /** Account manager who owns the relationship. */
  ownerId: string | null;
  startedAt: string;
  /** Renewal date for retained accounts; null for prospects and one-offs. */
  renewsAt: string | null;
}

export interface Contact {
  id: string;
  accountId: string;
  name: string;
  email: string;
  title: string;
  /** Decision makers get their silence weighted more heavily. */
  isPrimary: boolean;
}

export interface Conversation {
  id: string;
  accountId: string;
  contactId: string;
  subject: string;
  channel: Channel;
  state: ConversationState;
  assigneeId: string | null;
  openedAt: string;
  lastMessageAt: string;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  /**
   * When the client first wrote in. Not always `openedAt`: a thread the agency
   * started as outreach opens with an outbound message, and the client's wait
   * plainly does not begin before they have said anything.
   */
  firstInboundAt: string | null;
  /**
   * When the first outbound reply landed *after* that first inbound. Kept
   * separately from `lastOutboundAt` because the latest reply on a
   * twelve-message thread says nothing about how long the client waited to hear
   * from anyone at all — and that first wait is what clients actually judge.
   */
  firstResponseAt: string | null;
  waitingOn: WaitingOn;
  snoozedUntil: string | null;
  closedAt: string | null;
  /** Set when the thread is the live discussion for an open deal. */
  dealId: string | null;
  tags: string[];
  messageCount: number;
  hasDraft: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  authorName: string;
  /** Null for inbound mail — the author is a contact, not a team member. */
  authorId: string | null;
  sentAt: string;
  body: string;
  isDraft: boolean;
}

export type DealStage =
  | 'lead'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost';

export interface Deal {
  id: string;
  accountId: string;
  name: string;
  stage: DealStage;
  /** Total contract value in whole dollars. */
  value: number;
  /** Monthly retainer portion, if the deal carries one. */
  retainerMonthly: number;
  ownerId: string | null;
  openedAt: string;
  stageEnteredAt: string;
  expectedCloseAt: string;
  closedAt: string | null;
  lostReason: string;
  source: string;
}

export interface DealEvent {
  id: string;
  dealId: string;
  fromStage: DealStage | null;
  toStage: DealStage;
  at: string;
  actorId: string | null;
}

/** Everything the read models need, loaded once per request. */
export interface AgencySnapshot {
  now: string;
  team: TeamMember[];
  accounts: Account[];
  contacts: Contact[];
  conversations: Conversation[];
  deals: Deal[];
  dealEvents: DealEvent[];
}
