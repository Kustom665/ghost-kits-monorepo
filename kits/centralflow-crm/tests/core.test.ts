import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_WORK_WEEK,
  addBusinessHours,
  businessDaysBetween,
  businessHoursBetween,
  isWithinBusinessHours,
  median,
  nextBusinessInstant,
  percentile,
  subtractBusinessHours,
} from '../src/core/time.ts';
import {
  RESPONSE_TARGETS,
  assessSla,
  firstResponseHours,
  firstResponseSample,
  owesResponse,
  summarizeSla,
} from '../src/core/sla.ts';
import {
  bucketBySla,
  buildTriage,
  countFolders,
  inFolder,
  isAwake,
  matchesStatus,
  scoreConversation,
} from '../src/core/triage.ts';
import {
  buildBoard,
  findStalledDeals,
  forecast,
  measureStageDwell,
  measureStageProbabilities,
  summarizePipeline,
} from '../src/core/pipeline.ts';
import { assessAccountHealth, buildTeamLoad, draftReply, rankAccountHealth } from '../src/core/accounts.ts';
import { assessAll } from '../src/core/sla.ts';
import type {
  Account,
  Contact,
  Conversation,
  Deal,
  DealEvent,
  DealStage,
  TeamMember,
} from '../src/core/types.ts';

/** The agency runs Mon-Fri 09:00-18:00 at UTC-5, so local 09:00 is 14:00Z. */
function local(day: string, hhmm: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, date, h + 5, m)).toISOString();
}

const FRI_5PM = local('2026-03-06', '17:00');
const MON_930AM = local('2026-03-09', '09:30');
const NOW = local('2026-03-09', '12:00');

function account(over: Partial<Account> = {}): Account {
  return {
    id: 'acc_1',
    name: 'Northwind',
    tier: 'growth',
    retainerMonthly: 6000,
    industry: 'retail',
    ownerId: 'tm_1',
    startedAt: '2025-01-05T00:00:00.000Z',
    renewsAt: null,
    ...over,
  };
}

function conversation(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 'cv_1',
    accountId: 'acc_1',
    contactId: 'ct_1',
    subject: 'Landing page copy',
    channel: 'email',
    state: 'open',
    assigneeId: 'tm_1',
    openedAt: FRI_5PM,
    lastMessageAt: FRI_5PM,
    lastInboundAt: FRI_5PM,
    lastOutboundAt: null,
    firstInboundAt: FRI_5PM,
    firstResponseAt: null,
    waitingOn: 'us',
    snoozedUntil: null,
    closedAt: null,
    dealId: null,
    tags: [],
    messageCount: 1,
    hasDraft: false,
    ...over,
  };
}

function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: 'ct_1',
    accountId: 'acc_1',
    name: 'Dana Reyes',
    email: 'dana@northwind.test',
    title: 'Marketing Director',
    isPrimary: true,
    ...over,
  };
}

function member(over: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'tm_1',
    name: 'Alex Mora',
    role: 'account_manager',
    email: 'alex@studio.test',
    weeklyCapacityHours: 32,
    active: true,
    ...over,
  };
}

function deal(over: Partial<Deal> = {}): Deal {
  return {
    id: 'dl_1',
    accountId: 'acc_1',
    name: 'Site rebuild',
    stage: 'proposal',
    value: 48_000,
    retainerMonthly: 0,
    ownerId: 'tm_1',
    openedAt: '2026-02-01T14:00:00.000Z',
    stageEnteredAt: '2026-02-20T14:00:00.000Z',
    expectedCloseAt: '2026-03-20T14:00:00.000Z',
    closedAt: null,
    lostReason: '',
    source: 'referral',
    ...over,
  };
}

function dealEvent(dealId: string, toStage: DealStage, at: string, fromStage: DealStage | null = null): DealEvent {
  return { id: `${dealId}_${toStage}_${at}`, dealId, fromStage, toStage, at, actorId: 'tm_1' };
}

describe('business-hours clock', () => {
  test('skips the weekend between Friday evening and Monday morning', () => {
    // 17:00-18:00 Friday is one hour; 09:00-09:30 Monday is another half.
    assert.equal(businessHoursBetween(FRI_5PM, MON_930AM), 1.5);
  });

  test('ignores time outside the working window on the same day', () => {
    const before = local('2026-03-09', '07:00');
    const after = local('2026-03-09', '21:00');
    assert.equal(businessHoursBetween(before, after), 9);
  });

  test('returns zero for a fully non-working interval', () => {
    assert.equal(businessHoursBetween(local('2026-03-07', '09:00'), local('2026-03-08', '17:00')), 0);
  });

  test('is not negative when the interval runs backwards', () => {
    assert.equal(businessHoursBetween(MON_930AM, FRI_5PM), 0);
  });

  test('a deadline set on Friday evening lands Monday midday', () => {
    // One hour left on Friday, three hours spill into Monday from 09:00.
    assert.equal(addBusinessHours(FRI_5PM, 4), local('2026-03-09', '12:00'));
  });

  test('a deadline inside the working day is plain addition', () => {
    assert.equal(addBusinessHours(local('2026-03-09', '10:00'), 2), local('2026-03-09', '12:00'));
  });

  test('walking back four working hours from Monday noon lands Friday evening', () => {
    assert.equal(subtractBusinessHours(NOW, 4), FRI_5PM);
    assert.equal(businessHoursBetween(subtractBusinessHours(NOW, 12), NOW), 12);
  });

  test('snapping forward skips a closed weekend', () => {
    assert.equal(nextBusinessInstant(local('2026-03-07', '11:00')), local('2026-03-09', '09:00'));
    assert.equal(nextBusinessInstant(local('2026-03-09', '11:00')), local('2026-03-09', '11:00'));
  });

  test('business days divide by the length of the working day', () => {
    assert.equal(businessDaysBetween(local('2026-03-09', '09:00'), local('2026-03-10', '18:00')), 2);
  });

  test('recognises hours inside and outside the window', () => {
    assert.equal(isWithinBusinessHours(local('2026-03-09', '10:00')), true);
    assert.equal(isWithinBusinessHours(local('2026-03-09', '18:30')), false);
    assert.equal(isWithinBusinessHours(local('2026-03-07', '10:00')), false);
  });

  test('median and percentile use nearest rank', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
    assert.equal(percentile([], 90), 0);
  });
});

describe('response targets', () => {
  test('only threads waiting on us owe a response', () => {
    assert.equal(owesResponse(conversation(), NOW), true);
    assert.equal(owesResponse(conversation({ waitingOn: 'them' }), NOW), false);
    assert.equal(owesResponse(conversation({ state: 'closed' }), NOW), false);
  });

  test('a snoozed thread stops the clock until its date passes', () => {
    const parked = conversation({ state: 'snoozed', snoozedUntil: local('2026-03-12', '09:00') });
    assert.equal(owesResponse(parked, NOW), false);

    const woken = conversation({ state: 'snoozed', snoozedUntil: local('2026-03-09', '08:00') });
    assert.equal(owesResponse(woken, NOW), true);
  });

  test('the weekend does not burn a client-facing budget', () => {
    // Friday 5pm to Monday noon is three calendar days but only four working
    // hours, so a starter account's eight-hour first-response budget is intact.
    const sla = assessSla(conversation(), 'starter', NOW);
    assert.equal(sla.isFirstResponse, true);
    assert.equal(sla.budgetHours, RESPONSE_TARGETS.starter.firstResponseHours);
    assert.equal(sla.owedHours, 4);
    assert.equal(sla.status, 'clear');
  });

  test('the same wait breaches a prospect budget', () => {
    const sla = assessSla(conversation(), 'prospect', NOW);
    assert.equal(sla.status, 'breached');
    assert.equal(sla.remainingHours, -3);
    assert.ok(sla.pressure > 1);
  });

  test('an established thread is held to the follow-up budget', () => {
    const sla = assessSla(
      conversation({ lastOutboundAt: local('2026-03-05', '10:00'), messageCount: 6 }),
      'growth',
      NOW,
    );
    assert.equal(sla.isFirstResponse, false);
    assert.equal(sla.budgetHours, RESPONSE_TARGETS.growth.followUpHours);
  });

  test('due_soon fires inside the last quarter of the budget', () => {
    // Flagship first response is 2h: one hour burned Friday, 40 minutes today.
    const sla = assessSla(conversation(), 'flagship', local('2026-03-09', '09:40'));
    assert.equal(sla.status, 'due_soon');
    assert.equal(sla.dueAt, local('2026-03-09', '10:00'));
  });

  test('threads with no debt are excluded from the summary', () => {
    const owed = assessSla(conversation(), 'prospect', NOW);
    const quiet = assessSla(conversation({ waitingOn: 'them' }), 'prospect', NOW);
    const summary = summarizeSla([owed, quiet]);
    assert.equal(summary.owed, 1);
    assert.equal(summary.breached, 1);
    assert.equal(summary.worstOwedHours, 4);
  });

  test('first-response sample skips threads still waiting', () => {
    const answered = conversation({
      id: 'cv_a',
      openedAt: local('2026-03-05', '10:00'),
      firstInboundAt: local('2026-03-05', '10:00'),
      firstResponseAt: local('2026-03-05', '13:00'),
      lastOutboundAt: local('2026-03-05', '13:00'),
      messageCount: 2,
    });
    const waiting = conversation({ id: 'cv_b', lastOutboundAt: null, firstResponseAt: null });
    const sample = firstResponseSample([answered, waiting], NOW, 30);
    assert.deepEqual(sample, [3]);
  });

  test('a long thread is still measured on its first reply, not its latest', () => {
    // Twelve messages deep, answered promptly on day one. Reading the latest
    // outbound instead would report this as a nine-day first response.
    const longThread = conversation({
      openedAt: local('2026-03-02', '09:00'),
      firstInboundAt: local('2026-03-02', '09:00'),
      firstResponseAt: local('2026-03-02', '11:00'),
      lastOutboundAt: local('2026-03-09', '11:00'),
      messageCount: 12,
    });
    assert.equal(firstResponseHours(longThread), 2);
    assert.deepEqual(firstResponseSample([longThread], NOW, 30), [2]);
  });

  test('an outreach thread is measured from the reply we owed, not from our own opener', () => {
    // We wrote first on Monday, the prospect answered Thursday, we came back
    // within the hour. Measuring from the opener would call that three days.
    const outreach = conversation({
      openedAt: local('2026-03-02', '09:00'),
      firstInboundAt: local('2026-03-05', '14:00'),
      firstResponseAt: local('2026-03-05', '15:00'),
      lastOutboundAt: local('2026-03-05', '15:00'),
      messageCount: 3,
    });
    assert.equal(firstResponseHours(outreach), 1);
  });

  test('a thread the client has never written on has no first-response figure', () => {
    const unanswered = conversation({
      firstInboundAt: null,
      firstResponseAt: null,
      lastInboundAt: null,
      lastOutboundAt: FRI_5PM,
      waitingOn: 'them',
    });
    assert.equal(firstResponseHours(unanswered), null);
    assert.deepEqual(firstResponseSample([unanswered], NOW, 30), []);
  });
});

describe('inbox triage', () => {
  test('a breached flagship thread outranks a fresh starter thread', () => {
    const flagship = scoreConversation(
      conversation({ id: 'cv_big' }),
      account({ id: 'acc_big', tier: 'flagship', retainerMonthly: 22_000 }),
      contact(),
      null,
      NOW,
    );
    const starter = scoreConversation(
      conversation({ id: 'cv_small', lastInboundAt: local('2026-03-09', '11:45'), openedAt: local('2026-03-09', '11:45') }),
      account({ id: 'acc_small', tier: 'starter', retainerMonthly: 1200 }),
      contact(),
      null,
      NOW,
    );
    assert.ok(flagship.score > starter.score);
    assert.ok(flagship.reasons.some((r) => r.includes('past the')));
  });

  test('an unowned thread is ranked above the same thread with an owner', () => {
    const base = { id: 'cv_x' } as const;
    const owned = scoreConversation(conversation(base), account(), contact(), null, NOW);
    const orphan = scoreConversation(
      conversation({ ...base, assigneeId: null }),
      account(),
      contact(),
      null,
      NOW,
    );
    assert.ok(orphan.score > owned.score);
    assert.ok(orphan.reasons.includes('Nobody owns this thread yet'));
  });

  test('a live negotiation adds weight and says so', () => {
    const withDeal = scoreConversation(
      conversation({ dealId: 'dl_1' }),
      account(),
      contact(),
      deal({ stage: 'negotiation' }),
      NOW,
    );
    const without = scoreConversation(conversation(), account(), contact(), null, NOW);
    assert.ok(withDeal.score > without.score);
    assert.ok(withDeal.reasons.some((r) => r.includes('negotiation deal')));
  });

  test('a thread waiting on the client scores no SLA pressure', () => {
    const item = scoreConversation(
      conversation({ waitingOn: 'them', lastOutboundAt: FRI_5PM }),
      account({ tier: 'flagship', retainerMonthly: 22_000 }),
      contact(),
      null,
      NOW,
    );
    assert.equal(item.sla.status, 'not_owed');
    assert.equal(item.reasons.some((r) => r.includes('past the')), false);
  });

  test('triage skips conversations whose account is missing', () => {
    const items = buildTriage(
      [conversation(), conversation({ id: 'cv_orphan', accountId: 'acc_gone' })],
      [account()],
      [contact()],
      [],
      NOW,
    );
    assert.equal(items.length, 1);
  });

  test('buildTriage returns highest score first', () => {
    const items = buildTriage(
      [
        conversation({ id: 'cv_low', accountId: 'acc_small', lastInboundAt: local('2026-03-09', '11:50') }),
        conversation({ id: 'cv_high', accountId: 'acc_big', assigneeId: null }),
      ],
      [
        account({ id: 'acc_small', tier: 'starter', retainerMonthly: 1000 }),
        account({ id: 'acc_big', tier: 'flagship', retainerMonthly: 25_000 }),
      ],
      [contact()],
      [],
      NOW,
    );
    assert.equal(items[0].conversation.id, 'cv_high');
  });

  test('folders route each thread to the right place', () => {
    const closed = conversation({ id: 'c1', state: 'closed', closedAt: NOW });
    const parked = conversation({ id: 'c2', state: 'snoozed', snoozedUntil: local('2026-03-12', '09:00') });
    const woken = conversation({ id: 'c3', state: 'snoozed', snoozedUntil: local('2026-03-09', '08:00') });
    const orphan = conversation({ id: 'c4', assigneeId: null });
    const draft = conversation({ id: 'c5', hasDraft: true });

    assert.equal(inFolder(closed, 'inbox', NOW, 'tm_1'), false);
    assert.equal(inFolder(closed, 'closed', NOW, 'tm_1'), true);
    assert.equal(inFolder(parked, 'inbox', NOW, 'tm_1'), false);
    assert.equal(inFolder(parked, 'snoozed', NOW, 'tm_1'), true);
    // A snooze whose date has passed belongs back in the inbox, not in limbo.
    assert.equal(isAwake(woken, NOW), true);
    assert.equal(inFolder(woken, 'inbox', NOW, 'tm_1'), true);
    assert.equal(inFolder(woken, 'snoozed', NOW, 'tm_1'), false);
    assert.equal(inFolder(orphan, 'unassigned', NOW, 'tm_1'), true);
    assert.equal(inFolder(orphan, 'mine', NOW, 'tm_1'), false);
    assert.equal(inFolder(draft, 'drafts', NOW, 'tm_1'), true);

    const counts = countFolders([closed, parked, woken, orphan, draft], NOW, 'tm_1');
    assert.equal(counts.inbox, 3);
    assert.equal(counts.unassigned, 1);
    assert.equal(counts.closed, 1);
    assert.equal(counts.snoozed, 1);
    assert.equal(counts.drafts, 1);
    assert.equal(counts.all, 5);
  });

  test('status filters split the queue by who is blocked', () => {
    const items = buildTriage(
      [conversation({ id: 'cv_us' }), conversation({ id: 'cv_them', waitingOn: 'them', lastOutboundAt: FRI_5PM })],
      [account({ tier: 'prospect', retainerMonthly: 0 })],
      [contact()],
      [],
      NOW,
    );
    assert.equal(items.filter((i) => matchesStatus(i, 'waiting_on_us', NOW)).length, 1);
    assert.equal(items.filter((i) => matchesStatus(i, 'waiting_on_them', NOW)).length, 1);
    assert.equal(items.filter((i) => matchesStatus(i, 'breached', NOW)).length, 1);
    assert.equal(bucketBySla(items).not_owed, 1);
  });
});

describe('pipeline', () => {
  const history: Deal[] = [];
  const events: DealEvent[] = [];
  for (let i = 0; i < 10; i += 1) {
    const won = i < 4;
    const id = `dl_h${i}`;
    history.push(
      deal({
        id,
        stage: won ? 'won' : 'lost',
        value: 20_000,
        openedAt: '2026-01-05T14:00:00.000Z',
        closedAt: '2026-02-16T14:00:00.000Z',
      }),
    );
    events.push(dealEvent(id, 'proposal', '2026-01-05T14:00:00.000Z'));
    events.push(dealEvent(id, won ? 'won' : 'lost', '2026-02-16T14:00:00.000Z', 'proposal'));
  }

  test('measured win rate replaces the default once the sample is deep enough', () => {
    const probabilities = measureStageProbabilities(history, events);
    const proposal = probabilities.find((p) => p.stage === 'proposal');
    assert.ok(proposal);
    assert.equal(proposal.measured, true);
    assert.equal(proposal.sample, 10);
    assert.equal(proposal.probability, 0.4);
  });

  test('a thin sample keeps the default rather than inventing a rate', () => {
    const probabilities = measureStageProbabilities(history.slice(0, 3), events);
    const proposal = probabilities.find((p) => p.stage === 'proposal');
    assert.ok(proposal);
    assert.equal(proposal.measured, false);
    assert.equal(proposal.probability, 0.45);
  });

  test('dwell time counts completed passes only', () => {
    const open = deal({ id: 'dl_open', stage: 'negotiation', stageEnteredAt: '2026-03-06T14:00:00.000Z' });
    const dwell = measureStageDwell(
      [...history, open],
      [...events, dealEvent('dl_open', 'negotiation', '2026-03-06T14:00:00.000Z')],
    );
    // The open deal's unfinished negotiation interval contributes nothing.
    assert.equal(dwell.get('negotiation')?.sample, 0);
    assert.ok((dwell.get('proposal')?.sample ?? 0) > 0);
  });

  test('a deal past the slow quartile for its stage is stalled', () => {
    const fresh = deal({ id: 'dl_fresh', stage: 'negotiation', stageEnteredAt: local('2026-03-09', '09:00') });
    const rotting = deal({ id: 'dl_rot', stage: 'negotiation', stageEnteredAt: '2026-01-05T14:00:00.000Z' });
    const stalled = findStalledDeals([...history, fresh, rotting], events, NOW);
    assert.deepEqual(stalled.map((s) => s.deal.id), ['dl_rot']);
    assert.ok(stalled[0].severity > 1);
  });

  test('forecast weights by stage and separates slipped deals', () => {
    const onTrack = deal({ id: 'dl_a', stage: 'proposal', value: 100_000, expectedCloseAt: '2026-03-20T14:00:00.000Z' });
    const late = deal({ id: 'dl_b', stage: 'negotiation', value: 50_000, expectedCloseAt: '2026-03-01T14:00:00.000Z' });
    const result = forecast([...history, onTrack, late], events, NOW, 60);
    assert.equal(result.inWindow, 2);
    assert.equal(result.grossValue, 150_000);
    // Proposal is the measured 0.4 here, negotiation keeps its 0.7 default.
    assert.equal(result.weightedValue, 75_000);
    assert.equal(result.slipped, 1);
    assert.equal(result.slippedValue, 50_000);
  });

  test('the board reports weighted value per open stage', () => {
    const board = buildBoard([...history, deal({ id: 'dl_c', stage: 'proposal', value: 10_000 })], events, NOW);
    const proposal = board.find((c) => c.stage === 'proposal');
    assert.ok(proposal);
    assert.equal(proposal.count, 1);
    assert.equal(proposal.weightedValue, 4000);
    assert.equal(board.every((c) => c.stage !== 'won' && c.stage !== 'lost'), true);
  });

  test('summary reports win rate over closed deals in the window', () => {
    const summary = summarizePipeline(history, events, NOW, 180);
    assert.equal(summary.closedSample, 10);
    assert.equal(summary.winRate, 0.4);
    assert.equal(summary.openDeals, 0);
  });
});

describe('account health', () => {
  const slaFor = (conversations: Conversation[], accounts: Account[]) =>
    assessAll(conversations, accounts, NOW);

  test('a breach costs health and the reason names the wait', () => {
    const acc = account({ tier: 'flagship', retainerMonthly: 20_000 });
    const breached = [conversation()];
    const health = assessAccountHealth(acc, breached, [], slaFor(breached, [acc]), NOW);

    // Same account, same recency — the only difference is who is blocked.
    const answered = [conversation({ waitingOn: 'them', lastOutboundAt: local('2026-03-09', '10:00'), messageCount: 4 })];
    const control = assessAccountHealth(acc, answered, [], slaFor(answered, [acc]), NOW);

    assert.equal(health.breachedThreads, 1);
    assert.equal(control.breachedThreads, 0);
    assert.ok(health.score < control.score);
    assert.ok(health.reasons.some((r) => r.includes('past the response target')));
  });

  test('silence from a flagship account is penalised harder than from a starter', () => {
    const quiet = conversation({
      waitingOn: 'nobody',
      state: 'closed',
      closedAt: '2026-02-01T14:00:00.000Z',
      lastInboundAt: '2026-02-01T14:00:00.000Z',
      lastOutboundAt: '2026-02-01T15:00:00.000Z',
      messageCount: 8,
    });
    const flagship = account({ id: 'acc_f', tier: 'flagship', retainerMonthly: 20_000 });
    const starter = account({ id: 'acc_s', tier: 'starter', retainerMonthly: 1500 });
    const flagshipHealth = assessAccountHealth(flagship, [{ ...quiet, accountId: 'acc_f' }], [], new Map(), NOW);
    const starterHealth = assessAccountHealth(starter, [{ ...quiet, accountId: 'acc_s' }], [], new Map(), NOW);
    assert.ok(flagshipHealth.score < starterHealth.score);
    assert.ok(flagshipHealth.reasons.some((r) => r.includes('No inbound')));
  });

  test('an imminent renewal is surfaced before it arrives', () => {
    const acc = account({ renewsAt: '2026-04-01T00:00:00.000Z' });
    const threads = [conversation({ waitingOn: 'them', lastInboundAt: local('2026-03-09', '09:00'), lastOutboundAt: local('2026-03-09', '10:00'), messageCount: 4 })];
    const health = assessAccountHealth(acc, threads, [], slaFor(threads, [acc]), NOW);
    assert.equal(health.daysToRenewal, 22);
    assert.ok(health.reasons.some((r) => r.includes('Renews in')));
  });

  test('ranking puts the worst account first', () => {
    const healthy = account({ id: 'acc_ok' });
    const hurting = account({ id: 'acc_bad', tier: 'flagship', retainerMonthly: 20_000 });
    const threads = [
      conversation({ id: 'cv_ok', accountId: 'acc_ok', waitingOn: 'them', lastInboundAt: local('2026-03-09', '09:00'), lastOutboundAt: local('2026-03-09', '10:00'), messageCount: 4 }),
      conversation({ id: 'cv_bad', accountId: 'acc_bad' }),
    ];
    const ranked = rankAccountHealth([healthy, hurting], threads, [], slaFor(threads, [healthy, hurting]), NOW);
    assert.equal(ranked[0].account.id, 'acc_bad');
  });

  test('team load isolates who is actually underwater', () => {
    const team = [member(), member({ id: 'tm_2', name: 'Priya Raman' })];
    const threads = [
      conversation({ id: 'cv_1', assigneeId: 'tm_1' }),
      conversation({ id: 'cv_2', assigneeId: 'tm_1', accountId: 'acc_1' }),
      conversation({ id: 'cv_3', assigneeId: 'tm_2', waitingOn: 'them', lastOutboundAt: FRI_5PM }),
    ];
    const acc = account({ tier: 'prospect', retainerMonthly: 0 });
    const load = buildTeamLoad(team, threads, slaFor(threads, [acc]), NOW);
    assert.equal(load[0].member.id, 'tm_1');
    assert.equal(load[0].owedThreads, 2);
    assert.equal(load[0].breachedThreads, 2);
    assert.equal(load[1].owedThreads, 0);
    assert.equal(load[1].openThreads, 1);
  });

  test('the drafted reply apologises only when the thread is actually late', () => {
    const acc = account({ tier: 'prospect' });
    const late = draftReply(conversation(), contact(), member(), assessSla(conversation(), acc.tier, NOW), NOW);
    assert.match(late, /Apologies for the slow reply/);
    assert.match(late, /Dana/);
    assert.match(late, /Alex Mora/);

    const fresh = conversation({ lastInboundAt: local('2026-03-09', '11:50') });
    const prompt = draftReply(fresh, contact(), member(), assessSla(fresh, 'growth', NOW), NOW);
    assert.equal(/Apologies/.test(prompt), false);
  });
});
