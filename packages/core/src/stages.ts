import { STAGES, type Stage, type StageMeta } from './types.ts';

/**
 * Stage definitions with service-level targets.
 *
 * The SLA numbers are the defaults we ship; a firm should tune them. What
 * matters is that every stage has one, because "how long is too long" is the
 * question nobody in a tax firm can answer in February without it.
 */
export const STAGE_META: Record<Stage, StageMeta> = {
  intake: {
    stage: 'intake',
    label: 'Intake',
    kind: 'active',
    slaDays: 2,
    owner: 'firm',
    description: 'Engagement letter out, organizer sent, prior-year rolled forward.',
  },
  docs_pending: {
    stage: 'docs_pending',
    label: 'Awaiting Documents',
    kind: 'client_wait',
    slaDays: 14,
    owner: 'client',
    description: 'Waiting on the client for source documents. The most common silent stall.',
  },
  ready_for_prep: {
    stage: 'ready_for_prep',
    label: 'Ready for Prep',
    kind: 'queue',
    slaDays: 3,
    owner: 'firm',
    description: 'Documents are complete. Sitting in the queue for a preparer.',
  },
  in_prep: {
    stage: 'in_prep',
    label: 'In Preparation',
    kind: 'active',
    slaDays: 4,
    owner: 'firm',
    description: 'A preparer is actively working the return.',
  },
  review_queue: {
    stage: 'review_queue',
    label: 'Review Queue',
    kind: 'queue',
    slaDays: 3,
    owner: 'firm',
    description: 'Prep complete, waiting on a reviewer. Usually the true constraint.',
  },
  in_review: {
    stage: 'in_review',
    label: 'In Review',
    kind: 'active',
    slaDays: 3,
    owner: 'firm',
    description: 'A reviewer is working the return.',
  },
  partner_signoff: {
    stage: 'partner_signoff',
    label: 'Partner Sign-off',
    kind: 'queue',
    slaDays: 2,
    owner: 'firm',
    description: 'Awaiting final partner approval before release to the client.',
  },
  client_signature: {
    stage: 'client_signature',
    label: 'Awaiting Signature',
    kind: 'client_wait',
    slaDays: 5,
    owner: 'client',
    description: 'Return released, waiting on a signed e-file authorization (8879).',
  },
  efile: {
    stage: 'efile',
    label: 'E-file Transmitted',
    kind: 'active',
    slaDays: 2,
    owner: 'firm',
    description: 'Transmitted to the taxing authority, awaiting acknowledgement.',
  },
  accepted: {
    stage: 'accepted',
    label: 'Accepted',
    kind: 'terminal',
    slaDays: 0,
    owner: 'firm',
    description: 'Acknowledged by the taxing authority. Done.',
  },
  extended: {
    stage: 'extended',
    label: 'Extended',
    kind: 'terminal',
    slaDays: 0,
    owner: 'firm',
    description: 'Extension filed. Off the busy-season critical path.',
  },
};

export const STAGE_ORDER: Record<Stage, number> = Object.fromEntries(
  STAGES.map((s, i) => [s, i]),
) as Record<Stage, number>;

export const TERMINAL_STAGES: Stage[] = STAGES.filter(
  (s) => STAGE_META[s].kind === 'terminal',
);

/** Stages a return can still be sitting in and consuming busy-season capacity. */
export const ACTIVE_PIPELINE_STAGES: Stage[] = STAGES.filter(
  (s) => STAGE_META[s].kind !== 'terminal',
);

export function isTerminal(stage: Stage): boolean {
  return STAGE_META[stage].kind === 'terminal';
}

/**
 * The stages a return still has to pass through to reach `accepted`.
 * Used to project a finish date from where a return sits right now.
 */
export function remainingStages(from: Stage): Stage[] {
  if (isTerminal(from)) return [];
  const startIdx = STAGE_ORDER[from];
  return STAGES.filter(
    (s) => STAGE_ORDER[s] >= startIdx && s !== 'extended' && !isTerminal(s),
  );
}

/** True when a stage transition moved the return backwards (a kickback). */
export function isBackwardMove(from: Stage | null, to: Stage): boolean {
  if (from === null) return false;
  if (isTerminal(to)) return false;
  return STAGE_ORDER[to] < STAGE_ORDER[from];
}
