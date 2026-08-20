'use server';

import { revalidatePath } from 'next/cache';
import { ALL_STAGES, type DealStage } from '@agency/core';
import { publish } from '@/live/bus.ts';
import {
  assignConversation,
  getViewerId,
  moveDealStage,
  reseed,
  saveDraft,
  sendReply,
  setConversationState,
} from '@/db/queries.ts';

/**
 * Server actions are the only write path. Each one validates its own input — a
 * form field is user input no matter how the form was rendered.
 */

const STATES = ['open', 'snoozed', 'closed'] as const;
type State = (typeof STATES)[number];

function requireId(formData: FormData, field: string): string {
  const value = String(formData.get(field) ?? '').trim();
  if (!value) throw new Error(`Missing ${field}`);
  return value;
}

/**
 * Every write ends the same way: invalidate this browser's cached routes, then
 * tell everyone else's browser that something moved. The socket carries the
 * notification only — each client re-renders from the server, so there is no
 * second copy of the ranking logic to drift.
 */
function refreshInbox(
  conversationId: string | undefined,
  action: 'reply' | 'draft' | 'assign' | 'state',
) {
  revalidatePath('/');
  revalidatePath('/pulse');
  revalidatePath('/accounts');
  if (conversationId) revalidatePath(`/conversations/${conversationId}`);

  publish({ type: 'conversation', conversationId: conversationId ?? '', action });
}

export async function assignConversationAction(formData: FormData) {
  const conversationId = requireId(formData, 'conversationId');
  const raw = String(formData.get('assigneeId') ?? '');
  // An empty value is a deliberate un-assign, not a missing field.
  const assigneeId = raw === '' ? null : raw === 'me' ? getViewerId() : raw;

  assignConversation(conversationId, assigneeId);
  refreshInbox(conversationId, 'assign');
}

export async function setConversationStateAction(formData: FormData) {
  const conversationId = requireId(formData, 'conversationId');
  const state = String(formData.get('state') ?? '') as State;
  if (!STATES.includes(state)) throw new Error(`Unknown state: ${state}`);

  let snoozedUntil: string | null = null;
  if (state === 'snoozed') {
    const days = Number(formData.get('snoozeDays') ?? 3);
    if (!Number.isFinite(days) || days <= 0 || days > 90) throw new Error('Snooze must be 1-90 days');
    snoozedUntil = new Date(Date.now() + days * 86_400_000).toISOString();
  }

  setConversationState(conversationId, state, snoozedUntil);
  refreshInbox(conversationId, 'state');
}

export async function saveDraftAction(formData: FormData) {
  const conversationId = requireId(formData, 'conversationId');
  const body = String(formData.get('body') ?? '').slice(0, 8000);

  saveDraft(conversationId, body, getViewerId());
  refreshInbox(conversationId, 'draft');
}

export async function sendReplyAction(formData: FormData) {
  const conversationId = requireId(formData, 'conversationId');
  const body = String(formData.get('body') ?? '').trim().slice(0, 8000);
  if (!body) throw new Error('Cannot send an empty reply');

  sendReply(conversationId, body, getViewerId());
  refreshInbox(conversationId, 'reply');
}

export async function moveDealStageAction(formData: FormData) {
  const dealId = requireId(formData, 'dealId');
  const toStage = String(formData.get('toStage') ?? '') as DealStage;
  if (!ALL_STAGES.includes(toStage)) throw new Error(`Unknown stage: ${toStage}`);

  moveDealStage(dealId, toStage, getViewerId());
  revalidatePath('/pipeline');
  revalidatePath('/pulse');
  revalidatePath('/accounts');
  publish({ type: 'deal', dealId, action: 'stage' });
}

/** Regenerate the demo agency. Destructive, and only meant for the sample data. */
export async function reseedAction() {
  reseed();
  revalidatePath('/', 'layout');
  publish({ type: 'reseed' });
}
