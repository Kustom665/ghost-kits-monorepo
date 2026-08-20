/**
 * Custom server: Next.js plus a WebSocket endpoint on /ws.
 *
 * A shared inbox is the one screen where a stale page is actively harmful —
 * two people answer the same client because neither could see the other pick
 * it up. Next alone cannot hold a socket open, so the HTTP server is ours and
 * Next is mounted inside it.
 *
 * The socket carries notifications, never data: a message saying "conversation
 * cv_84 changed", after which the browser re-fetches the server-rendered page.
 * That keeps every ranking and SLA decision in one place — the server — instead
 * of duplicating the domain logic in a client-side store that can disagree
 * with it.
 */

import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT ?? 3001);
const hostname = process.env.HOSTNAME ?? '0.0.0.0';
const dev = process.env.NODE_ENV !== 'production';

// Must match BUS_KEY in src/live/bus.ts — see the comment there for why the
// handle is a global rather than an import.
const BUS_KEY = '__centralflowBus';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res, parse(req.url ?? '/', true)).catch((error) => {
    console.error('[centralflow] request failed', error);
    res.statusCode = 500;
    res.end('internal error');
  });
});

const wss = new WebSocketServer({ noServer: true });

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const client of wss.clients) {
    // 1 === OPEN. Sending to a socket mid-close throws, and one dead tab must
    // not stop the rest of the shop from getting the update.
    if (client.readyState !== 1) continue;
    try {
      client.send(message);
    } catch (error) {
      console.error('[centralflow] broadcast failed', error);
    }
  }
}

function announcePresence() {
  let open = 0;
  for (const client of wss.clients) if (client.readyState === 1) open += 1;
  broadcast({ type: 'presence', count: open });
}

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'hello' }));
  announcePresence();

  // A socket that has stopped answering is a socket whose tab is gone; without
  // this, a laptop closed mid-afternoon inflates the presence count until the
  // TCP connection eventually gives up.
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });
  socket.on('close', announcePresence);
  socket.on('error', () => socket.terminate());
});

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) {
      client.terminate();
      continue;
    }
    client.isAlive = false;
    client.ping();
  }
}, 30_000);
heartbeat.unref();

const bus = (globalThis[BUS_KEY] ??= new (await import('node:events')).EventEmitter());
bus.setMaxListeners(0);
bus.on('change', (event) => broadcast({ type: 'change', event }));

server.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url ?? '/', true);

  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (client) => wss.emit('connection', client, req));
    return;
  }

  // Everything else on this port belongs to Next — in dev that is the
  // hot-reload socket, and hijacking it would break fast refresh.
  const upgrade = app.getUpgradeHandler();
  if (upgrade) {
    upgrade(req, socket, head);
    return;
  }
  socket.destroy();
});

server.listen(port, hostname, () => {
  console.log(`CentralFlow ready on http://localhost:${port} (live updates on /ws)`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(heartbeat);
    for (const client of wss.clients) client.terminate();
    server.close(() => process.exit(0));
  });
}
