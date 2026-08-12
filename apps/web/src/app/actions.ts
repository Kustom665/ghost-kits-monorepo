'use server';

import { revalidatePath } from 'next/cache';
import { STAGES, type DocStatus, type Reminder, type Stage } from '@taxflow/core';
import { advanceStage, logReminder, reseed, setDocStatus } from '@/db/queries.ts';

/**
 * Server actions are the only write path. Each one validates its own input —
 * a form field is user input no matter how the form was rendered.
 */

const CHANNELS: Reminder['channel'][] = ['email', 'sms', 'call', 'portal'];
const DOC_STATUSES: DocStatus[] = ['pending', 'received', 'not_applicable'];

export async function advanceStageAction(formData: FormData) {
  const returnId = String(formData.get('returnId') ?? '');
  const toStage = String(formData.get('toStage') ?? '');
  const actorId = String(formData.get('actorId') ?? '') || null;
  const note = String(formData.get('note') ?? '').slice(0, 500);

  if (!returnId) throw new Error('Missing return');
  if (!STAGES.includes(toStage as Stage)) throw new Error(`Unknown stage: ${toStage}`);

  advanceStage(returnId, toStage as Stage, actorId, note);

  revalidatePath('/');
  revalidatePath('/pipeline');
  revalidatePath('/capacity');
  revalidatePath('/triage');
  revalidatePath(`/returns/${returnId}`);
}

export async function setDocStatusAction(formData: FormData) {
  const docId = String(formData.get('docId') ?? '');
  const status = String(formData.get('status') ?? '');
  const returnId = String(formData.get('returnId') ?? '');

  if (!docId) throw new Error('Missing document');
  if (!DOC_STATUSES.includes(status as DocStatus)) throw new Error(`Unknown status: ${status}`);

  setDocStatus(docId, status as DocStatus);

  revalidatePath('/');
  revalidatePath('/chase');
  if (returnId) revalidatePath(`/returns/${returnId}`);
}

export async function logReminderAction(formData: FormData) {
  const returnId = String(formData.get('returnId') ?? '');
  const channel = String(formData.get('channel') ?? 'email');
  const body = String(formData.get('body') ?? '').slice(0, 4000);

  if (!returnId) throw new Error('Missing return');
  if (!CHANNELS.includes(channel as Reminder['channel'])) {
    throw new Error(`Unknown channel: ${channel}`);
  }

  logReminder(returnId, channel as Reminder['channel'], null, body);

  revalidatePath('/');
  revalidatePath('/chase');
  revalidatePath(`/returns/${returnId}`);
}

/** Regenerate the demo firm. Destructive, and only meant for the sample data. */
export async function reseedAction() {
  reseed();
  revalidatePath('/', 'layout');
}
