'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps the open page honest.
 *
 * The socket delivers notifications, not data — when one arrives this asks the
 * server for a fresh render of whatever the person is currently looking at.
 * The alternative, mirroring conversations into a client-side store, would mean
 * two implementations of the ranking and the SLA clock that are free to
 * disagree; this way there is still exactly one.
 */

type Status = 'connecting' | 'live' | 'offline';

const RETRY_MS = 2000;
const MAX_RETRY_MS = 30_000;
/** Collapse a burst of writes into one re-render. */
const REFRESH_DEBOUNCE_MS = 400;
/** Response clocks are measured in minutes, so a minute is a fine resolution. */
const TICK_MS = 60_000;

export function LiveIndicator() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('connecting');
  const [viewers, setViewers] = useState(1);

  // Kept in refs so reconnect scheduling never re-runs the effect and opens a
  // second socket.
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(RETRY_MS);

  useEffect(() => {
    let closed = false;

    const scheduleRefresh = () => {
      if (refreshRef.current) clearTimeout(refreshRef.current);
      refreshRef.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
    };

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (closed) return;
        delayRef.current = RETRY_MS;
        setStatus('live');
        // Anything that changed while this tab was disconnected is invisible
        // until we ask, so reconnecting always re-reads.
        scheduleRefresh();
      };

      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(message.data as string) as
            | { type: 'change' }
            | { type: 'presence'; count: number }
            | { type: 'hello' };
          if (payload.type === 'change') scheduleRefresh();
          else if (payload.type === 'presence') setViewers(payload.count);
        } catch {
          // A frame we cannot parse is a frame we ignore.
        }
      };

      socket.onclose = () => {
        if (closed) return;
        setStatus('offline');
        // Back off so a restarting server is not met with a reconnect storm.
        retryRef.current = setTimeout(connect, delayRef.current);
        delayRef.current = Math.min(delayRef.current * 2, MAX_RETRY_MS);
      };

      socket.onerror = () => socket.close();
    };

    connect();

    // The clocks on screen are relative ("6h over"), so a page left open still
    // has to move on its own. Only while the tab is visible — a background tab
    // re-rendering every minute is pure waste.
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, TICK_MS);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      router.refresh();
      if (socketRef.current?.readyState === WebSocket.CLOSED) connect();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      closed = true;
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
      if (retryRef.current) clearTimeout(retryRef.current);
      if (refreshRef.current) clearTimeout(refreshRef.current);
      socketRef.current?.close();
    };
  }, [router]);

  const colour =
    status === 'live' ? 'var(--ok)' : status === 'connecting' ? 'var(--warn)' : 'var(--bad)';

  const label =
    status === 'live'
      ? `Live · ${viewers} ${viewers === 1 ? 'tab' : 'tabs'}`
      : status === 'connecting'
        ? 'Connecting…'
        : 'Offline — retrying';

  return (
    <div
      className="flex items-center gap-2 px-1 text-[11px]"
      style={{ color: 'var(--text-faint)' }}
      title={
        status === 'live'
          ? 'Connected. The inbox updates itself when anyone on the team replies, assigns or closes a thread.'
          : 'Not connected. The page will catch up as soon as the socket comes back.'
      }
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: colour,
          boxShadow: status === 'live' ? `0 0 0 3px color-mix(in srgb, ${colour} 22%, transparent)` : 'none',
        }}
      />
      <span>{label}</span>
    </div>
  );
}
