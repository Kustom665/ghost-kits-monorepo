/**
 * New-business pipeline.
 *
 * The stage probabilities here start as sensible defaults and then get replaced
 * by this agency's own measured win rate as soon as there is enough closed
 * history to support one. A forecast built on a vendor's default percentages is
 * a forecast about somebody else's business.
 */

import {
  DEFAULT_WORK_WEEK,
  businessDaysBetween,
  clamp,
  median,
  percentile,
  round,
  type WorkWeek,
} from './time.ts';
import type { Deal, DealEvent, DealStage } from './types.ts';

export const OPEN_STAGES: DealStage[] = ['lead', 'qualified', 'proposal', 'negotiation'];
export const ALL_STAGES: DealStage[] = [...OPEN_STAGES, 'won', 'lost'];

export const STAGE_META: Record<
  DealStage,
  {
    label: string;
    order: number;
    /** Fallback close probability, used until measured history is available. */
    defaultProbability: number;
    /** Working days a healthy deal spends here before it needs a nudge. */
    healthyDwellDays: number;
    isOpen: boolean;
  }
> = {
  lead: { label: 'Lead', order: 0, defaultProbability: 0.1, healthyDwellDays: 5, isOpen: true },
  qualified: { label: 'Qualified', order: 1, defaultProbability: 0.25, healthyDwellDays: 8, isOpen: true },
  proposal: { label: 'Proposal', order: 2, defaultProbability: 0.45, healthyDwellDays: 10, isOpen: true },
  negotiation: { label: 'Negotiation', order: 3, defaultProbability: 0.7, healthyDwellDays: 7, isOpen: true },
  won: { label: 'Won', order: 4, defaultProbability: 1, healthyDwellDays: 0, isOpen: false },
  lost: { label: 'Lost', order: 5, defaultProbability: 0, healthyDwellDays: 0, isOpen: false },
};

export function isOpenStage(stage: DealStage): boolean {
  return STAGE_META[stage].isOpen;
}

/** The sample below which a measured rate is noise and the default is safer. */
export const MIN_PROBABILITY_SAMPLE = 8;

export interface StageProbability {
  stage: DealStage;
  probability: number;
  /** Closed deals that ever reached this stage. */
  sample: number;
  measured: boolean;
}

/**
 * Share of deals that reached a stage and eventually closed won. Computed from
 * the event log rather than current stage, because a deal that is sitting in
 * `lost` today still passed through `proposal` and that pass is exactly the
 * evidence a proposal-stage forecast needs.
 */
export function measureStageProbabilities(
  deals: Deal[],
  events: DealEvent[],
): StageProbability[] {
  const reached = new Map<string, Set<DealStage>>();
  for (const event of events) {
    const set = reached.get(event.dealId) ?? new Set<DealStage>();
    set.add(event.toStage);
    reached.set(event.dealId, set);
  }

  return OPEN_STAGES.map((stage) => {
    let sample = 0;
    let won = 0;
    for (const deal of deals) {
      if (isOpenStage(deal.stage)) continue;
      const stages = reached.get(deal.id);
      const touched = stages?.has(stage) ?? STAGE_META[deal.stage].order > STAGE_META[stage].order;
      if (!touched) continue;
      sample += 1;
      if (deal.stage === 'won') won += 1;
    }

    const measured = sample >= MIN_PROBABILITY_SAMPLE;
    return {
      stage,
      probability: measured ? round(won / sample, 3) : STAGE_META[stage].defaultProbability,
      sample,
      measured,
    };
  });
}

export function probabilityLookup(
  probabilities: StageProbability[],
): (stage: DealStage) => number {
  const byStage = new Map(probabilities.map((p) => [p.stage, p.probability]));
  return (stage) => byStage.get(stage) ?? STAGE_META[stage].defaultProbability;
}

export interface StageColumn {
  stage: DealStage;
  deals: Deal[];
  count: number;
  value: number;
  weightedValue: number;
  probability: number;
  medianDwellDays: number;
}

export function buildBoard(
  deals: Deal[],
  events: DealEvent[],
  nowIso: string,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): StageColumn[] {
  const probabilities = measureStageProbabilities(deals, events);
  const probabilityFor = probabilityLookup(probabilities);
  const dwell = measureStageDwell(deals, events, week);

  return OPEN_STAGES.map((stage) => {
    const inStage = deals
      .filter((d) => d.stage === stage)
      .sort((a, b) => b.value - a.value);
    const value = inStage.reduce((sum, d) => sum + d.value, 0);
    const probability = probabilityFor(stage);
    return {
      stage,
      deals: inStage,
      count: inStage.length,
      value,
      weightedValue: Math.round(value * probability),
      probability,
      medianDwellDays: dwell.get(stage)?.median ?? 0,
    };
  });
}

export interface StageDwell {
  stage: DealStage;
  /** Working days a deal typically spends here before moving on. */
  median: number;
  /** The slow tail — the threshold a deal has to pass to count as stalled. */
  p75: number;
  sample: number;
}

/**
 * Dwell time per stage, from completed passes only. A deal that entered
 * negotiation this morning has not spent "zero days" in negotiation; it has an
 * unfinished interval, and averaging those in makes every stage look fast.
 */
export function measureStageDwell(
  deals: Deal[],
  events: DealEvent[],
  week: WorkWeek = DEFAULT_WORK_WEEK,
): Map<DealStage, StageDwell> {
  const byDeal = new Map<string, DealEvent[]>();
  for (const event of events) {
    const list = byDeal.get(event.dealId) ?? [];
    list.push(event);
    byDeal.set(event.dealId, list);
  }

  const samples = new Map<DealStage, number[]>();
  for (const list of byDeal.values()) {
    const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at));
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const stage = sorted[i].toStage;
      if (!isOpenStage(stage)) continue;
      const days = businessDaysBetween(sorted[i].at, sorted[i + 1].at, week);
      const bucket = samples.get(stage) ?? [];
      bucket.push(days);
      samples.set(stage, bucket);
    }
  }

  const out = new Map<DealStage, StageDwell>();
  for (const stage of OPEN_STAGES) {
    const values = samples.get(stage) ?? [];
    out.set(stage, {
      stage,
      median: round(median(values), 1),
      p75: round(percentile(values, 75), 1),
      sample: values.length,
    });
  }
  void deals;
  return out;
}

export interface StalledDeal {
  deal: Deal;
  daysInStage: number;
  threshold: number;
  /** How far past the threshold, as a multiple. */
  severity: number;
}

/**
 * Deals sitting longer in a stage than this agency's own slow quartile takes to
 * clear it. Falls back to the stage's healthy-dwell default while history is
 * thin, so a new pipeline still surfaces obvious rot.
 */
export function findStalledDeals(
  deals: Deal[],
  events: DealEvent[],
  nowIso: string,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): StalledDeal[] {
  const dwell = measureStageDwell(deals, events, week);

  const stalled: StalledDeal[] = [];
  for (const deal of deals) {
    if (!isOpenStage(deal.stage)) continue;
    const stats = dwell.get(deal.stage);
    const measured = stats && stats.sample >= 5 ? stats.p75 : STAGE_META[deal.stage].healthyDwellDays;
    const threshold = Math.max(measured, 3);
    const daysInStage = businessDaysBetween(deal.stageEnteredAt, nowIso, week);
    if (daysInStage > threshold) {
      stalled.push({
        deal,
        daysInStage: round(daysInStage, 1),
        threshold: round(threshold, 1),
        severity: round(daysInStage / threshold, 2),
      });
    }
  }

  return stalled.sort((a, b) => b.severity * b.deal.value - a.severity * a.deal.value);
}

export interface Forecast {
  horizonDays: number;
  /** Open deals whose expected close lands inside the horizon. */
  inWindow: number;
  grossValue: number;
  weightedValue: number;
  /** New recurring revenue per month if the weighted view lands. */
  weightedRetainerMonthly: number;
  /** Open deals whose expected close date has already gone by. */
  slipped: number;
  slippedValue: number;
}

export function forecast(
  deals: Deal[],
  events: DealEvent[],
  nowIso: string,
  horizonDays = 60,
): Forecast {
  const probabilityFor = probabilityLookup(measureStageProbabilities(deals, events));
  const horizon = new Date(new Date(nowIso).getTime() + horizonDays * 86_400_000).toISOString();

  let inWindow = 0;
  let grossValue = 0;
  let weightedValue = 0;
  let weightedRetainer = 0;
  let slipped = 0;
  let slippedValue = 0;

  for (const deal of deals) {
    if (!isOpenStage(deal.stage)) continue;
    const p = probabilityFor(deal.stage);

    if (deal.expectedCloseAt < nowIso) {
      slipped += 1;
      slippedValue += deal.value;
    }

    if (deal.expectedCloseAt <= horizon) {
      inWindow += 1;
      grossValue += deal.value;
      weightedValue += deal.value * p;
      weightedRetainer += deal.retainerMonthly * p;
    }
  }

  return {
    horizonDays,
    inWindow,
    grossValue,
    weightedValue: Math.round(weightedValue),
    weightedRetainerMonthly: Math.round(weightedRetainer),
    slipped,
    slippedValue,
  };
}

export interface PipelineSummary {
  openDeals: number;
  openValue: number;
  weightedValue: number;
  /** Trailing win rate over closed deals in the window. */
  winRate: number;
  closedSample: number;
  medianCycleDays: number;
}

export function summarizePipeline(
  deals: Deal[],
  events: DealEvent[],
  nowIso: string,
  windowDays = 180,
  week: WorkWeek = DEFAULT_WORK_WEEK,
): PipelineSummary {
  const probabilityFor = probabilityLookup(measureStageProbabilities(deals, events));
  const cutoff = new Date(new Date(nowIso).getTime() - windowDays * 86_400_000).toISOString();

  let openDeals = 0;
  let openValue = 0;
  let weightedValue = 0;
  let won = 0;
  let closedSample = 0;
  const cycles: number[] = [];

  for (const deal of deals) {
    if (isOpenStage(deal.stage)) {
      openDeals += 1;
      openValue += deal.value;
      weightedValue += deal.value * probabilityFor(deal.stage);
      continue;
    }
    if (!deal.closedAt || deal.closedAt < cutoff) continue;
    closedSample += 1;
    if (deal.stage === 'won') {
      won += 1;
      cycles.push(businessDaysBetween(deal.openedAt, deal.closedAt, week));
    }
  }

  return {
    openDeals,
    openValue,
    weightedValue: Math.round(weightedValue),
    winRate: closedSample > 0 ? round(clamp(won / closedSample, 0, 1), 3) : 0,
    closedSample,
    medianCycleDays: round(median(cycles), 1),
  };
}
