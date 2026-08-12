import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDeadlineCohorts,
  buildStageIntervals,
  computeCapacityGap,
  computeReworkStats,
  computeStageMetrics,
  computeStaffLoad,
  findStalledReturns,
  identifyConstraint,
} from '../src/bottleneck.ts';
import { remainingStages, isBackwardMove, STAGE_META } from '../src/stages.ts';
import { assessAllRisk, buildExtensionTriage, summarizeRisk } from '../src/risk.ts';
import { buildDocChase, chaseTemperature, draftReminder, summarizeDocChase } from '../src/docs.ts';
import { median, percentile } from '../src/time.ts';
import type {
  Client, DocRequest, FirmSnapshot, Stage, StageEvent, Staff, TaxReturn,
} from '../src/types.ts';

const NOW = '2026-03-01T00:00:00.000Z';
const DAY = 86_400_000;

function iso(daysBeforeNow: number): string {
  return new Date(new Date(NOW).getTime() - daysBeforeNow * DAY).toISOString();
}

function staff(id: string, role: Staff['role'], name = id): Staff {
  return { id, name, role, weeklyCapacityHours: 40, active: true };
}

function client(id: string, name = id): Client {
  return { id, name, entityType: '1040', responsivenessScore: 50, email: `${id}@x.com`, phone: '555' };
}

function ret(id: string, stage: Stage, daysInStage: number, over: Partial<TaxReturn> = {}): TaxReturn {
  return {
    id,
    clientId: over.clientId ?? `cli_${id}`,
    taxYear: 2025,
    entityType: '1040',
    stage,
    stageEnteredAt: iso(daysInStage),
    createdAt: iso(daysInStage + 30),
    dueDate: new Date(new Date(NOW).getTime() + 30 * DAY).toISOString(),
    preparerId: 'prep1',
    reviewerId: 'rev1',
    partnerId: 'part1',
    estimatedHours: 10,
    complexity: 'moderate',
    priorYearFee: 2000,
    extended: false,
    notes: '',
    ...over,
  };
}

function evt(
  id: string, returnId: string, from: Stage | null, to: Stage, daysAgo: number,
  over: Partial<StageEvent> = {},
): StageEvent {
  return { id, returnId, fromStage: from, toStage: to, at: iso(daysAgo), actorId: null, isRework: false, note: '', ...over };
}

function snapshot(over: Partial<FirmSnapshot> = {}): FirmSnapshot {
  return {
    now: NOW,
    staff: [staff('prep1', 'preparer'), staff('rev1', 'reviewer'), staff('part1', 'partner')],
    clients: [],
    returns: [],
    events: [],
    docRequests: [],
    reminders: [],
    ...over,
  };
}

describe('time helpers', () => {
  test('median handles even and odd lengths', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([]), 0);
  });

  test('percentile uses nearest rank and clamps', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    assert.equal(percentile(values, 90), 9);
    assert.equal(percentile(values, 100), 10);
    assert.equal(percentile([], 90), 0);
  });
});

describe('stage helpers', () => {
  test('remainingStages excludes terminal stages and prior stages', () => {
    const rest = remainingStages('review_queue');
    assert.equal(rest[0], 'review_queue');
    assert.ok(rest.includes('efile'));
    assert.ok(!rest.includes('accepted'));
    assert.ok(!rest.includes('in_prep'));
  });

  test('remainingStages is empty once terminal', () => {
    assert.deepEqual(remainingStages('accepted'), []);
    assert.deepEqual(remainingStages('extended'), []);
  });

  test('isBackwardMove detects review kickbacks only', () => {
    assert.equal(isBackwardMove('in_review', 'in_prep'), true);
    assert.equal(isBackwardMove('in_prep', 'review_queue'), false);
    assert.equal(isBackwardMove(null, 'intake'), false);
    // Filing an extension moves to a terminal stage; it is not a kickback.
    assert.equal(isBackwardMove('in_review', 'extended'), false);
  });
});

describe('buildStageIntervals', () => {
  test('closes each interval at the next event and leaves the last open', () => {
    const events = [
      evt('e1', 'r1', null, 'intake', 10),
      evt('e2', 'r1', 'intake', 'docs_pending', 8),
      evt('e3', 'r1', 'docs_pending', 'ready_for_prep', 3),
    ];
    const intervals = buildStageIntervals(events);
    assert.equal(intervals.length, 3);

    const docs = intervals.find((i) => i.stage === 'docs_pending')!;
    assert.equal(docs.exitedAt, iso(3));

    const last = intervals.find((i) => i.stage === 'ready_for_prep')!;
    assert.equal(last.exitedAt, null);
  });

  test('sorts out-of-order events before pairing them', () => {
    const intervals = buildStageIntervals([
      evt('e3', 'r1', 'docs_pending', 'ready_for_prep', 3),
      evt('e1', 'r1', null, 'intake', 10),
      evt('e2', 'r1', 'intake', 'docs_pending', 8),
    ]);
    const intake = intervals.find((i) => i.stage === 'intake')!;
    assert.equal(intake.exitedAt, iso(8), 'intake should close at the docs_pending event');
  });
});

describe('computeStageMetrics', () => {
  test('measures WIP, breaches and flow rates for a stage', () => {
    const snap = snapshot({
      returns: [
        ret('r1', 'review_queue', 10), // SLA is 3 days -> breach
        ret('r2', 'review_queue', 1),
        ret('r3', 'accepted', 5), // terminal, must not count as WIP
      ],
      events: [
        // Two returns cleared review_queue inside the 28-day window.
        evt('e1', 'rX', 'review_queue', 'in_review', 5),
        evt('e2', 'rY', 'review_queue', 'in_review', 12),
        // Three arrived.
        evt('e3', 'rX', 'in_prep', 'review_queue', 20),
        evt('e4', 'rY', 'in_prep', 'review_queue', 22),
        evt('e5', 'r1', 'in_prep', 'review_queue', 10),
        // Outside the window entirely.
        evt('e6', 'rZ', 'review_queue', 'in_review', 60),
      ],
    });

    const rq = computeStageMetrics(snap).find((m) => m.stage === 'review_queue')!;
    assert.equal(rq.wip, 2);
    assert.equal(rq.slaBreaches, 1);
    assert.equal(rq.oldestDays, 10);
    assert.equal(rq.throughputPerWeek, 0.5, '2 exits over 4 weeks');
    assert.equal(rq.arrivalsPerWeek, 0.75, '3 arrivals over 4 weeks');
    assert.equal(rq.netFlowPerWeek, 0.25, 'queue is growing');
    assert.equal(rq.queueWeeks, 4, '2 in queue / 0.5 per week');
  });

  test('excludes still-open intervals from dwell statistics', () => {
    // r1 entered review 40 days ago and has not left. If that censored
    // interval leaked into the median it would report 40 days, not 2.
    const snap = snapshot({
      returns: [ret('r1', 'review_queue', 40)],
      events: [
        evt('e1', 'r1', 'in_prep', 'review_queue', 40),
        evt('e2', 'r2', 'in_prep', 'review_queue', 10),
        evt('e3', 'r2', 'review_queue', 'in_review', 8),
      ],
    });
    const rq = computeStageMetrics(snap).find((m) => m.stage === 'review_queue')!;
    assert.equal(rq.medianDaysInStage, 2, 'only the completed pass counts');
    assert.equal(rq.oldestDays, 40, 'but aging still sees the stuck return');
  });

  test('queueWeeks is null when nothing clears the stage', () => {
    const snap = snapshot({
      returns: [ret('r1', 'review_queue', 30)],
      events: [evt('e1', 'r1', 'in_prep', 'review_queue', 30)],
    });
    const rq = computeStageMetrics(snap).find((m) => m.stage === 'review_queue')!;
    assert.equal(rq.throughputPerWeek, 0);
    assert.equal(rq.queueWeeks, null);
  });
});

describe('identifyConstraint', () => {
  test('picks the stage with the most queued weeks, not the most returns', () => {
    const snap = snapshot({
      returns: [
        // 6 sitting in docs_pending, but it drains fast.
        ...Array.from({ length: 6 }, (_, i) => ret(`d${i}`, 'docs_pending', 2)),
        // Only 3 in review_queue, but almost nothing clears it.
        ...Array.from({ length: 3 }, (_, i) => ret(`q${i}`, 'review_queue', 9)),
      ],
      events: [
        // docs_pending: 12 exits in the window -> 3/week -> 2 weeks of queue.
        ...Array.from({ length: 12 }, (_, i) =>
          evt(`de${i}`, `dx${i}`, 'docs_pending', 'ready_for_prep', i + 1),
        ),
        // review_queue: 1 exit in the window -> 0.25/week -> 12 weeks of queue.
        evt('qe0', 'qx0', 'review_queue', 'in_review', 5),
      ],
    });

    const c = identifyConstraint(computeStageMetrics(snap))!;
    assert.equal(c.stage, 'review_queue');
    assert.equal(c.remedy, 'add_capacity');
  });

  test('a client-owned constraint recommends chasing, not hiring', () => {
    const snap = snapshot({
      returns: Array.from({ length: 8 }, (_, i) => ret(`d${i}`, 'docs_pending', 20)),
      events: [evt('de', 'dx', 'docs_pending', 'ready_for_prep', 5)],
    });
    const c = identifyConstraint(computeStageMetrics(snap))!;
    assert.equal(c.stage, 'docs_pending');
    assert.equal(c.remedy, 'chase_clients');
    assert.equal(STAGE_META[c.stage].owner, 'client');
  });

  test('owner filter finds the worst stage the firm actually controls', () => {
    const snap = snapshot({
      returns: [
        ...Array.from({ length: 20 }, (_, i) => ret(`d${i}`, 'docs_pending', 20)),
        ...Array.from({ length: 4 }, (_, i) => ret(`q${i}`, 'review_queue', 9)),
      ],
      events: [
        evt('de', 'dx', 'docs_pending', 'ready_for_prep', 5),
        evt('qe', 'qx', 'review_queue', 'in_review', 5),
      ],
    });
    const metrics = computeStageMetrics(snap);
    assert.equal(identifyConstraint(metrics)!.stage, 'docs_pending');
    assert.equal(identifyConstraint(metrics, { owner: 'firm' })!.stage, 'review_queue');
  });

  test('returns null for an empty pipeline', () => {
    assert.equal(identifyConstraint(computeStageMetrics(snapshot())), null);
  });
});

describe('computeCapacityGap', () => {
  const deadline = new Date(new Date(NOW).getTime() + 14 * DAY).toISOString(); // 2 weeks
  const laterDeadline = new Date(new Date(NOW).getTime() + 90 * DAY).toISOString();

  test('counts only the returns actually driving toward that deadline', () => {
    const snap = snapshot({
      returns: [
        ...Array.from({ length: 5 }, (_, i) => ret(`near${i}`, 'review_queue', 4, { dueDate: deadline })),
        // These are due in 90 days and must not inflate the near-term gap.
        ...Array.from({ length: 40 }, (_, i) => ret(`far${i}`, 'review_queue', 4, { dueDate: laterDeadline })),
      ],
      events: Array.from({ length: 8 }, (_, i) =>
        evt(`e${i}`, `x${i}`, 'review_queue', 'in_review', i + 1),
      ),
    });

    const gap = computeCapacityGap(snap, computeStageMetrics(snap), 'review_queue', deadline);
    assert.equal(gap.mustClear, 5, 'only the 5 near-deadline returns');
    assert.equal(gap.weeksToDeadline, 2);
    assert.equal(gap.requiredPerWeek, 2.5);
  });

  test('credits the cohort only its proportional share of throughput', () => {
    const snap = snapshot({
      returns: [
        ...Array.from({ length: 10 }, (_, i) => ret(`near${i}`, 'review_queue', 4, { dueDate: deadline })),
        ...Array.from({ length: 30 }, (_, i) => ret(`far${i}`, 'review_queue', 4, { dueDate: laterDeadline })),
      ],
      // 40 exits over 4 weeks -> 10/week across the whole stage.
      events: Array.from({ length: 40 }, (_, i) =>
        evt(`e${i}`, `x${i}`, 'review_queue', 'in_review', (i % 27) + 1),
      ),
    });

    const gap = computeCapacityGap(snap, computeStageMetrics(snap), 'review_queue', deadline);
    assert.equal(gap.cohortShare, 0.25, '10 of 40 upstream returns');
    assert.equal(gap.currentPerWeek, 2.5, '25% of a 10/week rate');
    assert.equal(gap.requiredPerWeek, 5, '10 returns over 2 weeks');
    assert.equal(gap.gapPerWeek, 2.5, 'short 2.5 returns per week');
    assert.equal(gap.projectedMisses, 5);
  });

  test('reports no shortfall when the cohort is comfortably covered', () => {
    const snap = snapshot({
      returns: Array.from({ length: 2 }, (_, i) => ret(`n${i}`, 'review_queue', 1, { dueDate: deadline })),
      events: Array.from({ length: 40 }, (_, i) =>
        evt(`e${i}`, `x${i}`, 'review_queue', 'in_review', (i % 27) + 1),
      ),
    });
    const gap = computeCapacityGap(snap, computeStageMetrics(snap), 'review_queue', deadline);
    assert.equal(gap.projectedMisses, 0);
    assert.equal(gap.extraHoursPerWeek, 0, 'a surplus must never report negative hours');
  });
});

describe('findStalledReturns', () => {
  test('ranks by days over SLA and names who to chase', () => {
    const snap = snapshot({
      clients: [client('cli_r2', 'Ada Client')],
      returns: [
        ret('r1', 'review_queue', 10), // SLA 3 -> 7 over
        ret('r2', 'docs_pending', 30, { clientId: 'cli_r2' }), // SLA 14 -> 16 over
        ret('r3', 'in_prep', 1), // within SLA
      ],
    });

    const stalled = findStalledReturns(snap);
    assert.deepEqual(stalled.map((s) => s.ret.id), ['r2', 'r1']);
    assert.equal(stalled[0].daysOverSla, 16);
    assert.equal(stalled[0].ownerName, 'Ada Client', 'client-owned stages point at the client');
    assert.equal(stalled[1].ownerName, 'rev1', 'review stages point at the reviewer');
  });

  test('never reports terminal returns as stalled', () => {
    const snap = snapshot({ returns: [ret('r1', 'accepted', 400), ret('r2', 'extended', 400)] });
    assert.equal(findStalledReturns(snap).length, 0);
  });
});

describe('computeStaffLoad', () => {
  test('separates queued work from throughput per person', () => {
    const snap = snapshot({
      staff: [staff('rev1', 'reviewer', 'Dana'), staff('rev2', 'reviewer', 'Sam')],
      returns: [
        ...Array.from({ length: 8 }, (_, i) => ret(`a${i}`, 'review_queue', 5, { reviewerId: 'rev1' })),
        ...Array.from({ length: 2 }, (_, i) => ret(`b${i}`, 'review_queue', 5, { reviewerId: 'rev2' })),
      ],
      events: [
        // Dana cleared 2 in the window; Sam cleared 4.
        ...Array.from({ length: 2 }, (_, i) =>
          evt(`d${i}`, `x${i}`, 'in_review', 'partner_signoff', i + 1, { actorId: 'rev1' }),
        ),
        ...Array.from({ length: 4 }, (_, i) =>
          evt(`s${i}`, `y${i}`, 'in_review', 'partner_signoff', i + 1, { actorId: 'rev2' }),
        ),
      ],
    });

    const loads = computeStaffLoad(snap);
    const dana = loads.find((l) => l.staff.id === 'rev1')!;
    const sam = loads.find((l) => l.staff.id === 'rev2')!;

    assert.equal(dana.assigned, 8);
    assert.equal(dana.queued, 8, 'review_queue is a queue stage');
    assert.equal(dana.throughputPerWeek, 0.5);
    assert.equal(dana.queueWeeks, 16);
    assert.equal(sam.queueWeeks, 2);
    assert.equal(loads[0].staff.id, 'rev1', 'worst queue sorts first');
  });

  test('does not credit a reviewer with another reviewer\'s returns', () => {
    const snap = snapshot({
      staff: [staff('rev1', 'reviewer'), staff('rev2', 'reviewer')],
      returns: [ret('r1', 'review_queue', 2, { reviewerId: 'rev2' })],
    });
    assert.equal(computeStaffLoad(snap).find((l) => l.staff.id === 'rev1')!.assigned, 0);
  });
});

describe('computeReworkStats', () => {
  test('rates kickbacks against completed reviews and attributes them', () => {
    const snap = snapshot({
      staff: [staff('prep1', 'preparer', 'Pat'), staff('prep2', 'preparer', 'Robin'), staff('rev1', 'reviewer')],
      returns: [ret('r1', 'in_prep', 1, { preparerId: 'prep1' }), ret('r2', 'in_prep', 1, { preparerId: 'prep2' })],
      events: [
        evt('k1', 'r1', 'in_review', 'in_prep', 3, { isRework: true, actorId: 'rev1' }),
        evt('k2', 'r1', 'in_review', 'in_prep', 6, { isRework: true, actorId: 'rev1' }),
        ...Array.from({ length: 8 }, (_, i) =>
          evt(`rv${i}`, `z${i}`, 'in_review', 'partner_signoff', i + 1, { actorId: 'rev1' }),
        ),
        evt('p1', 'r1', 'in_prep', 'review_queue', 4),
        evt('p2', 'r2', 'in_prep', 'review_queue', 4),
      ],
    });

    const stats = computeReworkStats(snap);
    assert.equal(stats.totalKickbacks, 2);
    assert.equal(stats.reviewsCompleted, 10, 'kickbacks are completed reviews too');
    assert.equal(stats.rate, 0.2);

    const pat = stats.byPreparer.find((p) => p.staff.id === 'prep1')!;
    const robin = stats.byPreparer.find((p) => p.staff.id === 'prep2')!;
    assert.equal(pat.kickbacks, 2);
    assert.equal(robin.kickbacks, 0);
    assert.equal(stats.byPreparer[0].staff.id, 'prep1', 'worst rate sorts first');
  });
});

describe('deadline cohorts', () => {
  test('groups open returns by the date they are driving toward', () => {
    const sep = new Date(new Date(NOW).getTime() + 30 * DAY).toISOString();
    const oct = new Date(new Date(NOW).getTime() + 60 * DAY).toISOString();
    const snap = snapshot({
      returns: [
        ret('r1', 'in_prep', 1, { dueDate: oct, entityType: '1040' }),
        ret('r2', 'in_prep', 1, { dueDate: sep, entityType: '1065' }),
        ret('r3', 'in_prep', 1, { dueDate: sep, entityType: '1120S' }),
        ret('r4', 'accepted', 1, { dueDate: sep }),
      ],
    });

    const cohorts = buildDeadlineCohorts(snap);
    assert.equal(cohorts.length, 2);
    assert.equal(cohorts[0].dueDate, sep, 'nearest deadline first');
    assert.equal(cohorts[0].count, 2, 'accepted returns are excluded');
    assert.deepEqual(cohorts[0].entityTypes, ['1065', '1120S']);
  });
});

describe('risk projection', () => {
  test('credits time already served in the current stage', () => {
    const base = snapshot({ returns: [ret('r1', 'efile', 0)] });
    const served = snapshot({ returns: [ret('r2', 'efile', 1.5)] });

    const fresh = assessAllRisk(base, computeStageMetrics(base))[0];
    const partway = assessAllRisk(served, computeStageMetrics(served))[0];
    assert.ok(partway.projectedDays < fresh.projectedDays, 'time served shortens the projection');
  });

  test('classifies on_track, at_risk and will_miss by slack', () => {
    const soon = new Date(new Date(NOW).getTime() + 1 * DAY).toISOString();
    const far = new Date(new Date(NOW).getTime() + 365 * DAY).toISOString();
    const snap = snapshot({
      returns: [
        ret('safe', 'efile', 0, { dueDate: far }),
        ret('late', 'intake', 0, { dueDate: soon }),
      ],
    });

    const risks = assessAllRisk(snap, computeStageMetrics(snap));
    assert.equal(risks.find((r) => r.ret.id === 'safe')!.level, 'on_track');
    assert.equal(risks.find((r) => r.ret.id === 'late')!.level, 'will_miss');
    assert.ok(risks[0].slackDays < risks[1].slackDays, 'worst slack sorts first');
  });

  test('a slow queue pushes the projection out', () => {
    // Same return, same stage — the only difference is how fast review clears.
    const build = (exits: number) =>
      snapshot({
        returns: [
          ret('r1', 'review_queue', 0),
          ...Array.from({ length: 20 }, (_, i) => ret(`w${i}`, 'review_queue', 3)),
        ],
        events: Array.from({ length: exits }, (_, i) =>
          evt(`e${i}`, `x${i}`, 'review_queue', 'in_review', (i % 27) + 1),
        ),
      });

    const fast = build(80);
    const slow = build(4);
    const fastRisk = assessAllRisk(fast, computeStageMetrics(fast)).find((r) => r.ret.id === 'r1')!;
    const slowRisk = assessAllRisk(slow, computeStageMetrics(slow)).find((r) => r.ret.id === 'r1')!;

    assert.ok(
      slowRisk.projectedDays > fastRisk.projectedDays,
      `slow queue (${slowRisk.projectedDays}d) should project later than fast (${fastRisk.projectedDays}d)`,
    );
  });

  test('terminal returns are excluded from risk entirely', () => {
    const snap = snapshot({ returns: [ret('r1', 'accepted', 1), ret('r2', 'extended', 1)] });
    assert.equal(assessAllRisk(snap, computeStageMetrics(snap)).length, 0);
  });

  test('summary totals the fees behind the misses', () => {
    const soon = new Date(new Date(NOW).getTime() + 1 * DAY).toISOString();
    const snap = snapshot({
      returns: [
        ret('m1', 'intake', 0, { dueDate: soon, priorYearFee: 5000 }),
        ret('m2', 'intake', 0, { dueDate: soon, priorYearFee: 1500 }),
      ],
    });
    const summary = summarizeRisk(assessAllRisk(snap, computeStageMetrics(snap)));
    assert.equal(summary.willMiss, 2);
    assert.equal(summary.feesAtRisk, 6500);
  });
});

describe('extension triage', () => {
  test('lists only unextended misses, worst slack first', () => {
    const soon = new Date(new Date(NOW).getTime() + 1 * DAY).toISOString();
    const far = new Date(new Date(NOW).getTime() + 365 * DAY).toISOString();
    const snap = snapshot({
      returns: [
        ret('miss_bad', 'intake', 0, { dueDate: soon }),
        ret('miss_mild', 'efile', 0, { dueDate: soon }),
        ret('already', 'intake', 0, { dueDate: soon, extended: true }),
        ret('fine', 'efile', 0, { dueDate: far }),
      ],
    });

    const triage = buildExtensionTriage(snap, assessAllRisk(snap, computeStageMetrics(snap)));
    const ids = triage.map((t) => t.risk.ret.id);
    assert.ok(!ids.includes('already'), 'already-extended returns drop off the list');
    assert.ok(!ids.includes('fine'), 'on-track returns are not triaged');
    assert.equal(ids[0], 'miss_bad', 'the worst miss is extended first');
  });

  test('explains a client-blocked candidate differently', () => {
    const soon = new Date(new Date(NOW).getTime() + 1 * DAY).toISOString();
    const snap = snapshot({ returns: [ret('r1', 'docs_pending', 40, { dueDate: soon })] });
    const triage = buildExtensionTriage(snap, assessAllRisk(snap, computeStageMetrics(snap)));
    assert.match(triage[0].rationale, /waiting on the client/);
  });
});

describe('document chase', () => {
  function docReq(id: string, returnId: string, type: string, over: Partial<DocRequest> = {}): DocRequest {
    return {
      id, returnId, docType: type, status: 'pending', rolledForward: false,
      requestedAt: iso(30), receivedAt: null, remindersSent: 0, lastReminderAt: null, ...over,
    };
  }

  test('temperature is driven by silence, not by the original ask', () => {
    assert.equal(chaseTemperature(3), 'fresh');
    assert.equal(chaseTemperature(10), 'chasing');
    assert.equal(chaseTemperature(20), 'cold');
    assert.equal(chaseTemperature(45), 'frozen');
  });

  test('a recent partial response keeps a long wait warm', () => {
    // Requested 60 days ago, but the client sent something 2 days ago.
    const snap = snapshot({
      clients: [client('c1', 'Talkative Co')],
      returns: [ret('r1', 'docs_pending', 60, { clientId: 'c1' })],
      docRequests: [
        docReq('d1', 'r1', 'W-2', { requestedAt: iso(60) }),
        docReq('d2', 'r1', '1099-INT', { requestedAt: iso(60), status: 'received', receivedAt: iso(2) }),
      ],
    });

    const row = buildDocChase(snap)[0];
    assert.equal(row.daysWaiting, 60, 'the ask is still 60 days old');
    assert.equal(row.daysSinceLastResponse, 2);
    assert.equal(row.temperature, 'fresh', 'they are responding, just slowly');
  });

  test('a silent client goes frozen', () => {
    const snap = snapshot({
      clients: [client('c1', 'Ghost LLC')],
      returns: [ret('r1', 'docs_pending', 60, { clientId: 'c1' })],
      docRequests: [
        docReq('d1', 'r1', 'W-2', { requestedAt: iso(60) }),
        docReq('d2', 'r1', 'K-1 (received)', { requestedAt: iso(60), status: 'received', receivedAt: iso(55) }),
      ],
    });
    const row = buildDocChase(snap)[0];
    assert.equal(row.temperature, 'frozen');
    assert.deepEqual(row.missingDocs, ['W-2']);
  });

  test('returns with nothing outstanding stay off the worklist', () => {
    const snap = snapshot({
      clients: [client('c1')],
      returns: [ret('r1', 'in_prep', 2, { clientId: 'c1' })],
      docRequests: [docReq('d1', 'r1', 'W-2', { status: 'received', receivedAt: iso(5) })],
    });
    assert.equal(buildDocChase(snap).length, 0);
  });

  test('not_applicable items are excluded from the total but do not block', () => {
    const snap = snapshot({
      clients: [client('c1')],
      returns: [ret('r1', 'docs_pending', 10, { clientId: 'c1' })],
      docRequests: [
        docReq('d1', 'r1', 'W-2'),
        docReq('d2', 'r1', 'SSA-1099', { status: 'not_applicable' }),
      ],
    });
    const row = buildDocChase(snap)[0];
    assert.equal(row.outstanding, 1);
    assert.equal(row.total, 1, 'N/A items are not part of the expected set');
  });

  test('counts reminders per client, not per outstanding document', () => {
    // One email chasing four documents is one reminder, not four.
    const snap = snapshot({
      clients: [client('c1')],
      returns: [ret('r1', 'docs_pending', 20, { clientId: 'c1' })],
      docRequests: [
        docReq('d1', 'r1', 'W-2', { remindersSent: 2 }),
        docReq('d2', 'r1', '1099-INT', { remindersSent: 2 }),
        docReq('d3', 'r1', 'K-1 (received)', { remindersSent: 2 }),
        docReq('d4', 'r1', '1098-T Tuition', { remindersSent: 2 }),
      ],
    });
    assert.equal(buildDocChase(snap)[0].remindersSent, 2);
  });

  test('summary counts blocked hours and the never-nudged gap', () => {
    const snap = snapshot({
      clients: [client('c1'), client('c2')],
      returns: [
        ret('r1', 'docs_pending', 10, { clientId: 'c1', estimatedHours: 8 }),
        ret('r2', 'docs_pending', 10, { clientId: 'c2', estimatedHours: 12 }),
      ],
      docRequests: [
        docReq('d1', 'r1', 'W-2'),
        docReq('d2', 'r2', 'W-2', { remindersSent: 2 }),
      ],
    });

    const summary = summarizeDocChase(buildDocChase(snap));
    assert.equal(summary.returnsBlocked, 2);
    assert.equal(summary.hoursBlocked, 20);
    assert.equal(summary.neverReminded, 1);
  });

  test('the drafted nudge names the specific missing documents', () => {
    const snap = snapshot({
      clients: [client('c1', 'Jordan Reyes')],
      returns: [ret('r1', 'docs_pending', 25, { clientId: 'c1' })],
      docRequests: [docReq('d1', 'r1', 'W-2'), docReq('d2', 'r1', '1098-T Tuition')],
    });

    const body = draftReminder(buildDocChase(snap)[0], 'Delgado & Sorensen CPAs');
    assert.match(body, /Hi Jordan,/);
    assert.match(body, /• W-2/);
    assert.match(body, /• 1098-T Tuition/);
    assert.match(body, /Delgado & Sorensen CPAs/);
  });
});
