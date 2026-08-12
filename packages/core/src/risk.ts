import type { FirmSnapshot, Stage, TaxReturn } from './types.ts';
import { STAGE_META, isTerminal, remainingStages } from './stages.ts';
import type { StageMetrics } from './bottleneck.ts';
import { addDays, daysBetween, round } from './time.ts';

export type RiskLevel = 'on_track' | 'at_risk' | 'will_miss';

export interface ReturnRisk {
  ret: TaxReturn;
  /** Projected working days still needed, from the current stage to accepted. */
  projectedDays: number;
  projectedCompletion: string; // ISO
  daysToDue: number;
  /** Days of buffer between the projection and the due date. Negative = late. */
  slackDays: number;
  level: RiskLevel;
  /** Per-stage breakdown, so the projection is auditable rather than magic. */
  path: Array<{ stage: Stage; days: number }>;
}

/** Buffer we insist on before calling a return genuinely safe. */
const SAFE_BUFFER_DAYS = 5;

/**
 * How long a stage will actually take for planning purposes.
 *
 * For queues we take the worse of observed dwell and the Little's Law wait,
 * because a queue that is growing will hurt a return arriving today more than
 * the historical median suggests.
 */
function expectedStageDays(metrics: StageMetrics | undefined, stage: Stage): number {
  const sla = STAGE_META[stage].slaDays;
  if (!metrics) return sla;

  const observed = metrics.medianDaysInStage > 0 ? metrics.medianDaysInStage : sla;
  if (STAGE_META[stage].kind === 'queue' && metrics.queueWeeks !== null) {
    return Math.max(observed, metrics.queueWeeks * 7);
  }
  return observed;
}

/**
 * Project a completion date for one return by walking the stages it still has
 * to pass through at the firm's *measured* pace — not at the pace anyone hopes
 * for. Time already served in the current stage is credited.
 */
export function assessReturnRisk(
  ret: TaxReturn,
  metricsByStage: Map<Stage, StageMetrics>,
  nowIso: string,
): ReturnRisk | null {
  if (isTerminal(ret.stage)) return null;

  const stages = remainingStages(ret.stage);
  const daysAlreadyInStage = daysBetween(ret.stageEnteredAt, nowIso);

  const path = stages.map((stage, idx) => {
    const full = expectedStageDays(metricsByStage.get(stage), stage);
    // The current stage is partially served already.
    const days = idx === 0 ? Math.max(0.25, full - daysAlreadyInStage) : full;
    return { stage, days: round(days) };
  });

  const projectedDays = round(path.reduce((sum, p) => sum + p.days, 0));
  const projectedCompletion = addDays(nowIso, projectedDays);
  const daysToDue = round(daysBetween(nowIso, ret.dueDate));
  const slackDays = round(daysToDue - projectedDays);

  const level: RiskLevel =
    slackDays >= SAFE_BUFFER_DAYS ? 'on_track' : slackDays >= 0 ? 'at_risk' : 'will_miss';

  return { ret, projectedDays, projectedCompletion, daysToDue, slackDays, level, path };
}

export function assessAllRisk(
  snapshot: FirmSnapshot,
  metrics: StageMetrics[],
): ReturnRisk[] {
  const byStage = new Map(metrics.map((m) => [m.stage, m]));
  return snapshot.returns
    .map((r) => assessReturnRisk(r, byStage, snapshot.now))
    .filter((r): r is ReturnRisk => r !== null)
    .sort((a, b) => a.slackDays - b.slackDays);
}

export interface RiskSummary {
  onTrack: number;
  atRisk: number;
  willMiss: number;
  /** Fees attached to the returns projected to miss. */
  feesAtRisk: number;
}

export function summarizeRisk(risks: ReturnRisk[]): RiskSummary {
  const willMiss = risks.filter((r) => r.level === 'will_miss');
  return {
    onTrack: risks.filter((r) => r.level === 'on_track').length,
    atRisk: risks.filter((r) => r.level === 'at_risk').length,
    willMiss: willMiss.length,
    feesAtRisk: Math.round(willMiss.reduce((sum, r) => sum + r.ret.priorYearFee, 0)),
  };
}

export interface ExtensionCandidate {
  risk: ReturnRisk;
  /** Why this one is on the list, in one line. */
  rationale: string;
  /** Hours freed from the busy-season critical path by extending it. */
  hoursFreed: number;
}

/**
 * Rank the returns that should be extended now rather than at the deadline.
 *
 * Extensions are not a failure — filing them late is. A firm that decides in
 * week 6 which returns are going on extension protects the ones that are not.
 * We prefer to extend returns that are missing anyway, are still blocked on
 * the client, and carry a lower fee.
 */
export function buildExtensionTriage(
  snapshot: FirmSnapshot,
  risks: ReturnRisk[],
  limit = 40,
): ExtensionCandidate[] {
  return risks
    .filter((r) => r.level === 'will_miss' && !r.ret.extended)
    .map((risk) => {
      const stageMeta = STAGE_META[risk.ret.stage];
      const blockedOnClient = stageMeta.owner === 'client';
      const rationale = blockedOnClient
        ? `Projected ${Math.abs(risk.slackDays)} days late and still waiting on the client in ${stageMeta.label}.`
        : `Projected ${Math.abs(risk.slackDays)} days late with ${risk.projectedDays} days of pipeline left.`;

      return { risk, rationale, hoursFreed: risk.ret.estimatedHours };
    })
    .sort((a, b) => {
      // Worst misses first; among similar misses, extend the cheaper client.
      const slack = a.risk.slackDays - b.risk.slackDays;
      if (slack !== 0) return slack;
      return a.risk.ret.priorYearFee - b.risk.ret.priorYearFee;
    })
    .slice(0, limit);
}
