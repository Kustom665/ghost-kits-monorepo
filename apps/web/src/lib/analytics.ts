import {
  assessAllRisk,
  buildDeadlineCohorts,
  buildDocChase,
  buildExtensionTriage,
  computeCapacityGap,
  computeReworkStats,
  computeStageMetrics,
  computeStaffLoad,
  findStalledReturns,
  identifyConstraint,
  isTerminal,
  summarizeDocChase,
  summarizeRisk,
} from '@taxflow/core';
import { loadSnapshot } from '@/db/queries.ts';

/**
 * One pass over the firm, shared by every page.
 *
 * The analytics are cheap enough to recompute per request, and doing so means
 * the numbers are never stale after a stage change or a logged reminder.
 */
export function getAnalytics() {
  const snapshot = loadSnapshot();

  const stageMetrics = computeStageMetrics(snapshot);
  const constraint = identifyConstraint(stageMetrics);
  const firmConstraint = identifyConstraint(stageMetrics, { owner: 'firm' });
  const cohorts = buildDeadlineCohorts(snapshot);

  // The capacity gap is only meaningful against a specific date and a specific
  // stage, so we anchor it to the nearest deadline and the worst stage the
  // firm can actually do something about.
  const gapStage = firmConstraint?.stage ?? constraint?.stage ?? 'review_queue';
  const capacityGap = cohorts.length
    ? computeCapacityGap(snapshot, stageMetrics, gapStage, cohorts[0].dueDate)
    : null;

  const risks = assessAllRisk(snapshot, stageMetrics);
  const chase = buildDocChase(snapshot);
  const openReturns = snapshot.returns.filter((r) => !isTerminal(r.stage));

  return {
    snapshot,
    stageMetrics,
    constraint,
    firmConstraint,
    cohorts,
    capacityGap,
    risks,
    riskSummary: summarizeRisk(risks),
    chase,
    chaseSummary: summarizeDocChase(chase),
    stalled: findStalledReturns(snapshot),
    staffLoad: computeStaffLoad(snapshot),
    rework: computeReworkStats(snapshot),
    triage: buildExtensionTriage(snapshot, risks),
    openReturns,
    clientById: new Map(snapshot.clients.map((c) => [c.id, c])),
    staffById: new Map(snapshot.staff.map((s) => [s.id, s])),
  };
}

export type Analytics = ReturnType<typeof getAnalytics>;
