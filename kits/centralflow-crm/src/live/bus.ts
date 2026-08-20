import { EventEmitter } from 'node:events';

/**
 * The in-process event bus that carries writes out to connected inboxes.
 *
 * It lives on `globalThis` for a specific reason: the custom server
 * (`server.mjs`) and the application's server actions are the same Node
 * process but not the same module registry — Next bundles the app graph
 * separately — so importing this file from both would otherwise produce two
 * unrelated emitters and nothing would ever be delivered. A global key is the
 * only handle they reliably share.
 *
 * Scope note: this is a single-process bus. It is exactly right for one shop on
 * one server, and it is the piece to swap for Redis pub/sub the day this runs on
 * more than one instance — the publish/subscribe shape stays the same.
 */

export const BUS_KEY = '__centralflowBus';

export type LiveEvent =
  | { type: 'conversation'; conversationId: string; action: 'reply' | 'draft' | 'assign' | 'state' }
  | { type: 'deal'; dealId: string; action: 'stage' }
  | { type: 'reseed' };

interface BusHost {
  [BUS_KEY]?: EventEmitter;
}

export function getBus(): EventEmitter {
  const host = globalThis as unknown as BusHost;
  if (!host[BUS_KEY]) {
    const emitter = new EventEmitter();
    // Every browser tab is a listener; the default cap of 10 would start
    // printing warnings on the eleventh open tab in a busy shop.
    emitter.setMaxListeners(0);
    host[BUS_KEY] = emitter;
  }
  return host[BUS_KEY];
}

/** Announce a write. Never throws — a broken socket must not fail a save. */
export function publish(event: LiveEvent): void {
  try {
    getBus().emit('change', event);
  } catch {
    // Delivery is best effort. The database write already succeeded, and the
    // client falls back to its own polling if it hears nothing.
  }
}
