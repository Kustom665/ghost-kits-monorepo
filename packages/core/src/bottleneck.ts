import {
  ACTIVE_PIPELINE_STAGES,
  STAGE_META,
  STAGE_ORDER,
  isTerminal,
} from './stages.ts';
import type {
  FirmSnapshot,
  Stage,
  StageEvent,
  StageMeta,
  Staff,
  StaffRole,
  TaxReturn,
} from './types.ts';
import { daysBetween, median, percentile, round, toMs } from './time.ts';

/** How far back we look when measuring flow rates. Four weeks smooths out
 *  the week-to-week noise of a tax practice without going stale. */
export const DEFAULT_WINDOW_DAYS = 28;

export interface StageMetrics {
  stage: Stage;
  meta: StageMeta;
  /** Returns sitting in this stage right now. */
  wip: number;
  /** Budgeted hours locked up in this stage. */
  wipHours: number;
  /** Dwell time of *completed* passes through this stage, in days. */
  medianDaysInStage: number;
  p90DaysInStage: number;
  slaDays: number;
  /** Current WIP that has already blown the SLA. */
  slaBreaches: number;
  /** Age of the oldest thing sitting here, in days. */
  oldestDays: number;
  arrivalsPerWeek: number;
  throughputPerWeek: number;
  /** Arrivals minus throughput. Positive means this stage is backing up. */
  netFlowPerWeek: number;
  /**
   * Little's Law: how many weeks of work are queued here at the current
   * clearance rate. `null` when nothing has cleared the stage in the window,
   * which is itself the loudest possible signal.
   */
  queueWeeks: number | null;
}

interface StageInterval {
  returnId: string;
  stage: Stage;
  enteredAt: string;
  exitedAt: string | null;
  actorId: string | null;
}

/**
 * Reconstruct every stage occupancy interval from the event log.
 *
 * The event log is the source of truth for all timing. A return's current
 * `stage` field is a convenience denormalization; the intervals are what let
 * us answer "how long does review actually take here".
 */
export function buildStageIntervals(events: StageEvent[]): StageInterval[] {
  const byReturn = new Map<string, StageEvent[]>();
  for (const event of events) {
    const list = byReturn.get(event.returnId);
    if (list) list.push(event);
    else byReturn.set(event.returnId, [event]);
  }

  const intervals: StageInterval[] = [];
  for (const [returnId, list] of byReturn) {
    list.sort((a, b) => toMs(a.at) - toMs(b.at));
    for (let i = 0; i < list.length; i++) {
      intervals.push({
        returnId,
        stage: list[i].toStage,
        enteredAt: list[i].at,
        exitedAt: i + 1 < list.length ? list[i + 1].at : null,
        actorId: list[i].actorId,
      });
    }
  }
  return intervals;
}

export function computeStageMetrics(
  snapshot: FirmSnapshot,
  windowDays = DEFAULT_WINDOW_DAYS,
): StageMetrics[] {
  const { now, returns, events } = snapshot;
  const windowStartMs = toMs(now) - windowDays * 86_400_000;
  const weeks = windowDays / 7;
  const intervals = buildStageIntervals(events);

  // Completed dwell times, bucketed by stage. We deliberately exclude
  // still-open intervals: including them would drag the median down, because
  // a return that entered review an hour ago is not a one-hour review.
  const dwellByStage = new Map<Stage, number[]>();
  for (const interval of intervals) {
    if (interval.exitedAt === null) continue;
    const days = daysBetween(interval.enteredAt, interval.exitedAt);
    const bucket = dwellByStage.get(interval.stage);
    if (bucket) bucket.push(days);
    else dwellByStage.set(interval.stage, [days]);
  }

  const openReturns = returns.filter((r) => !isTerminal(r.stage));

  return ACTIVE_PIPELINE_STAGES.map((stage) => {
    const meta = STAGE_META[stage];
    const here = openReturns.filter((r) => r.stage === stage);
    const ages = here.map((r) => daysBetween(r.stageEnteredAt, now));
    const dwells = dwellByStage.get(stage) ?? [];

    const arrivals = events.filter(
      (e) => e.toStage === stage && toMs(e.at) >= windowStartMs,
    ).length;
    const exits = events.filter(
      (e) => e.fromStage === stage && toMs(e.at) >= windowStartMs,
    ).length;

    const throughputPerWeek = exits / weeks;
    const arrivalsPerWeek = arrivals / weeks;

    return {
      stage,
      meta,
      wip: here.length,
      wipHours: round(here.reduce((sum, r) => sum + r.estimatedHours, 0)),
      medianDaysInStage: round(median(dwells)),
      p90DaysInStage: round(percentile(dwells, 90)),
      slaDays: meta.slaDays,
      slaBreaches: ages.filter((d) => d > meta.slaDays).length,
      oldestDays: round(ages.length ? Math.max(...ages) : 0),
      // Rates keep two decimals: a low-volume stage clearing 0.75/week is
      // meaningfully different from one clearing 0.8/week when you divide WIP
      // by it. Formatting for display happens at the edge, not here.
      arrivalsPerWeek: round(arrivalsPerWeek, 2),
      throughputPerWeek: round(throughputPerWeek, 2),
      netFlowPerWeek: round(arrivalsPerWeek - throughputPerWeek, 2),
      queueWeeks: exits > 0 ? round(here.length / throughputPerWeek) : null,
    };
  });
}

export type RemedyKind = 'add_capacity' | 'chase_clients' | 'reduce_scope';

export interface Constraint {
  stage: Stage;
  meta: StageMeta;
  metrics: StageMetrics;
  /** Weeks of queued work, or `Infinity` when nothing is clearing. */
  queueWeeks: number;
  /** Plain-language reason this stage was named the constraint. */
  reason: string;
  /** Where the fix lives, which depends on who owns the waiting. */
  remedy: RemedyKind;
  isGrowing: boolean;
}

/**
 * Find the stage that is actually gating the season.
 *
 * The constraint is the stage holding the most weeks of queued work at its
 * current clearance rate — not the stage with the most returns in it. A stage
 * with 60 returns that clears 60 a week is fine; a stage with 18 that clears
 * 4 a week is where the season dies.
 */
export function identifyConstraint(
  metrics: StageMetrics[],
  opts: { owner?: 'firm' | 'client' } = {},
): Constraint | null {
  const candidates = metrics.filter(
    (m) => m.wip > 0 && (opts.owner === undefined || m.meta.owner === opts.owner),
  );
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((m) => ({ m, weeks: m.queueWeeks === null ? Number.POSITIVE_INFINITY : m.queueWeeks }))
    .sort((a, b) => {
      if (b.weeks !== a.weeks) return b.weeks - a.weeks;
      return b.m.wip - a.m.wip;
    });

  const { m, weeks } = scored[0];
  const remedy: RemedyKind =
    m.meta.owner === 'client'
      ? 'chase_clients'
      : m.meta.kind === 'active'
        ? 'reduce_scope'
        : 'add_capacity';

  const reason =
    m.queueWeeks === null
      ? `${m.wip} returns are sitting in ${m.meta.label} and nothing has cleared it in the last four weeks.`
      : `${m.wip} returns are queued in ${m.meta.label} against a clearance rate of ` +
        `${m.throughputPerWeek}/week — about ${weeks} weeks of backlog.`;

  return {
    stage: m.stage,
    meta: m.meta,
    metrics: m,
    queueWeeks: weeks,
    reason,
    remedy,
    isGrowing: m.netFlowPerWeek > 0,
  };
}

export interface DeadlineCohort {
  dueDate: string; // ISO
  daysAway: number;
  /** Open returns driving toward this date. */
  count: number;
  hours: number;
  entityTypes: string[];
}

/**
 * Group the open pipeline by the date each return is actually driving toward.
 *
 * A firm is never working one deadline. Showing a single countdown hides the
 * fact that the September partnership wall and the October individual wall are
 * different problems competing for the same reviewers.
 */
export function buildDeadlineCohorts(snapshot: FirmSnapshot): DeadlineCohort[] {
  const groups = new Map<string, TaxReturn[]>();
  for (const ret of snapshot.returns) {
    if (isTerminal(ret.stage)) continue;
    const list = groups.get(ret.dueDate);
    if (list) list.push(ret);
    else groups.set(ret.dueDate, [ret]);
  }

  return [...groups.entries()]
    .map(([dueDate, rets]) => ({
      dueDate,
      daysAway: round(daysBetween(snapshot.now, dueDate)),
      count: rets.length,
      hours: round(rets.reduce((sum, r) => sum + r.estimatedHours, 0)),
      entityTypes: [...new Set(rets.map((r) => r.entityType))].sort(),
    }))
    .sort((a, b) => a.daysAway - b.daysAway);
}

export interface CapacityGap {
  stage: Stage;
  /** Returns that still have to pass through this stage before the deadline. */
  mustClear: number;
  weeksToDeadline: number;
  /** Returns per week required to clear them all in time. */
  requiredPerWeek: number;
  /** This cohort's proportional share of the stage's clearance rate. */
  currentPerWeek: number;
  /** Fraction of the stage's throughput attributed to this cohort. */
  cohortShare: number;
  /** Positive means you are short this many returns of throughput per week. */
  gapPerWeek: number;
  /** Returns projected to miss the deadline if nothing changes. */
  projectedMisses: number;
  /** Extra hours per week implied by the gap, at this stage's average size. */
  extraHoursPerWeek: number;
}

/**
 * Turn the constraint into a number a partner can act on: how many returns
 * per week short you are, and therefore how many will miss the date.
 */
export function computeCapacityGap(
  snapshot: FirmSnapshot,
  metrics: StageMetrics[],
  stage: Stage,
  deadlineIso: string,
): CapacityGap {
  const stageMetrics = metrics.find((m) => m.stage === stage);
  const stageIdx = STAGE_ORDER[stage];

  // Everything at or upstream of the constraint still has to flow through it —
  // but only the returns actually driving toward this deadline count. A firm
  // works several statutory dates at once, and counting October's individual
  // returns against a September partnership deadline would invent a crisis.
  const mustClearReturns = snapshot.returns.filter(
    (r) =>
      !isTerminal(r.stage) &&
      STAGE_ORDER[r.stage] <= stageIdx &&
      toMs(r.dueDate) <= toMs(deadlineIso),
  );
  const mustClear = mustClearReturns.length;

  // The stage has one throughput, and every deadline cohort competes for it.
  // We credit this cohort with its proportional share rather than the whole
  // rate — otherwise a cohort of 43 returns would look comfortably covered by
  // a clearance rate that is in fact also serving 100 returns due later.
  // Triaging the near deadline first raises this cohort's effective share.
  const allUpstream = snapshot.returns.filter(
    (r) => !isTerminal(r.stage) && STAGE_ORDER[r.stage] <= stageIdx,
  );
  const cohortShare = allUpstream.length > 0 ? mustClear / allUpstream.length : 0;

  const weeksToDeadline = Math.max(
    0.1,
    daysBetween(snapshot.now, deadlineIso) / 7,
  );
  const requiredPerWeek = mustClear / weeksToDeadline;
  const currentPerWeek = (stageMetrics?.throughputPerWeek ?? 0) * cohortShare;
  const gapPerWeek = requiredPerWeek - currentPerWeek;

  const avgHours =
    mustClearReturns.length > 0
      ? mustClearReturns.reduce((sum, r) => sum + r.estimatedHours, 0) / mustClearReturns.length
      : 0;

  return {
    stage,
    mustClear,
    weeksToDeadline: round(weeksToDeadline),
    requiredPerWeek: round(requiredPerWeek),
    currentPerWeek: round(currentPerWeek),
    cohortShare: round(cohortShare, 2),
    gapPerWeek: round(gapPerWeek),
    projectedMisses: Math.max(0, Math.round(mustClear - currentPerWeek * weeksToDeadline)),
    extraHoursPerWeek: round(Math.max(0, gapPerWeek) * avgHours),
  };
}

export interface StalledReturn {
  ret: TaxReturn;
  daysInStage: number;
  slaDays: number;
  daysOverSla: number;
  meta: StageMeta;
  /** Who to go talk to about this one. */
  ownerName: string;
}

/**
 * Returns that have blown their stage SLA, worst first. This is the daily
 * stand-up list — the whole point is that nothing rots silently.
 */
export function findStalledReturns(
  snapshot: FirmSnapshot,
  limit?: number,
): StalledReturn[] {
  const staffById = new Map(snapshot.staff.map((s) => [s.id, s]));
  const clientById = new Map(snapshot.clients.map((c) => [c.id, c]));

  const stalled = snapshot.returns
    .filter((r) => !isTerminal(r.stage))
    .map((ret) => {
      const meta = STAGE_META[ret.stage];
      const daysInStage = daysBetween(ret.stageEnteredAt, snapshot.now);
      const ownerId =
        meta.kind === 'client_wait'
          ? null
          : ret.stage === 'in_review' || ret.stage === 'review_queue'
            ? ret.reviewerId
            : ret.stage === 'partner_signoff'
              ? ret.partnerId
              : ret.preparerId;
      const ownerName =
        meta.kind === 'client_wait'
          ? (clientById.get(ret.clientId)?.name ?? 'Client')
          : (staffById.get(ownerId ?? '')?.name ?? 'Unassigned');

      return {
        ret,
        daysInStage: round(daysInStage),
        slaDays: meta.slaDays,
        daysOverSla: round(daysInStage - meta.slaDays),
        meta,
        ownerName,
      };
    })
    .filter((s) => s.daysOverSla > 0)
    .sort((a, b) => b.daysOverSla - a.daysOverSla);

  return limit ? stalled.slice(0, limit) : stalled;
}

export interface StaffLoad {
  staff: Staff;
  /** Open returns assigned to this person in the stages they own. */
  assigned: number;
  /** Of those, how many are queued behind them rather than in progress. */
  queued: number;
  assignedHours: number;
  /** Returns this person cleared per week over the window. */
  throughputPerWeek: number;
  /** Weeks to burn down their queue at their own clearance rate. */
  queueWeeks: number | null;
  /** Share of their reviews that went back to the preparer. */
  reworkRate: number;
  /** Assigned hours against their stated weekly capacity. */
  utilization: number;
}

/** The stages each role is on the hook for clearing. */
const ROLE_STAGES: Record<StaffRole, { queue: Stage[]; clears: Stage }> = {
  admin: { queue: ['intake', 'docs_pending'], clears: 'intake' },
  preparer: { queue: ['ready_for_prep', 'in_prep'], clears: 'in_prep' },
  reviewer: { queue: ['review_queue', 'in_review'], clears: 'in_review' },
  partner: { queue: ['partner_signoff'], clears: 'partner_signoff' },
};

/**
 * Per-person load and throughput.
 *
 * A stage-level bottleneck is usually one or two specific people. This is the
 * view that names them, so the fix is "move three returns off Dana" rather
 * than "we should really do something about review".
 */
export function computeStaffLoad(
  snapshot: FirmSnapshot,
  windowDays = DEFAULT_WINDOW_DAYS,
): StaffLoad[] {
  const windowStartMs = toMs(snapshot.now) - windowDays * 86_400_000;
  const weeks = windowDays / 7;

  return snapshot.staff
    .filter((s) => s.active)
    .map((staff) => {
      const { queue: queueStages, clears } = ROLE_STAGES[staff.role];

      const mine = snapshot.returns.filter((r) => {
        if (isTerminal(r.stage)) return false;
        if (!queueStages.includes(r.stage)) return false;
        const assignee =
          staff.role === 'reviewer'
            ? r.reviewerId
            : staff.role === 'partner'
              ? r.partnerId
              : r.preparerId;
        return assignee === staff.id;
      });

      const cleared = snapshot.events.filter(
        (e) =>
          e.actorId === staff.id &&
          e.fromStage === clears &&
          toMs(e.at) >= windowStartMs,
      ).length;

      const reworkSent = snapshot.events.filter(
        (e) => e.actorId === staff.id && e.isRework && toMs(e.at) >= windowStartMs,
      ).length;

      const throughputPerWeek = cleared / weeks;
      const assignedHours = mine.reduce((sum, r) => sum + r.estimatedHours, 0);

      return {
        staff,
        assigned: mine.length,
        queued: mine.filter((r) => STAGE_META[r.stage].kind === 'queue').length,
        assignedHours: round(assignedHours),
        throughputPerWeek: round(throughputPerWeek),
        queueWeeks: cleared > 0 ? round(mine.length / throughputPerWeek) : null,
        reworkRate: cleared > 0 ? round(reworkSent / cleared, 2) : 0,
        utilization:
          staff.weeklyCapacityHours > 0
            ? round(assignedHours / staff.weeklyCapacityHours, 2)
            : 0,
      };
    })
    .sort((a, b) => (b.queueWeeks ?? 999) - (a.queueWeeks ?? 999));
}

export interface ReworkStats {
  totalKickbacks: number;
  reviewsCompleted: number;
  /** Kickbacks per completed review. Above ~0.25 is a training problem. */
  rate: number;
  /** Preparers ranked by how often their work comes back. */
  byPreparer: Array<{ staff: Staff; kickbacks: number; prepared: number; rate: number }>;
}

/**
 * Rework is the most expensive hidden bottleneck in a tax practice: every
 * kickback costs the preparer's time, the reviewer's time twice, and a full
 * extra trip through the review queue.
 */
export function computeReworkStats(
  snapshot: FirmSnapshot,
  windowDays = DEFAULT_WINDOW_DAYS,
): ReworkStats {
  const windowStartMs = toMs(snapshot.now) - windowDays * 86_400_000;
  const inWindow = snapshot.events.filter((e) => toMs(e.at) >= windowStartMs);

  const kickbacks = inWindow.filter((e) => e.isRework);
  const reviewsCompleted = inWindow.filter((e) => e.fromStage === 'in_review').length;
  const returnById = new Map(snapshot.returns.map((r) => [r.id, r]));

  const byPreparer = snapshot.staff
    .filter((s) => s.active && s.role === 'preparer')
    .map((staff) => {
      const kb = kickbacks.filter(
        (e) => returnById.get(e.returnId)?.preparerId === staff.id,
      ).length;
      const prepared = inWindow.filter(
        (e) => e.fromStage === 'in_prep' && returnById.get(e.returnId)?.preparerId === staff.id,
      ).length;
      return { staff, kickbacks: kb, prepared, rate: prepared > 0 ? round(kb / prepared, 2) : 0 };
    })
    .sort((a, b) => b.rate - a.rate);

  return {
    totalKickbacks: kickbacks.length,
    reviewsCompleted,
    rate: reviewsCompleted > 0 ? round(kickbacks.length / reviewsCompleted, 2) : 0,
    byPreparer,
  };
}
