---
name: run-ghost-promo
description: Build, run, and screenshot the ghost-promo Vite+React app (GhostPromo animated promo card). Use when asked to run, start, preview, test, or screenshot ghost-promo or the GhostPromo component.
---

# Running ghost-promo

`kits/ghost-promo/` is a Vite + React app — a self-paced animated vertical
promo card (360×640, 5-beat sequence, glitch transitions). No backend.

All paths are relative to `kits/ghost-promo/`.

## Build

```bash
npm install
npm run build
```

## Run — agent path (driver)

```bash
# screenshot beat 0 (brand reveal)
node .claude/skills/run-ghost-promo/driver.mjs screenshot /tmp/shot.png

# click dot N (0-4) to jump to that beat, then screenshot
node .claude/skills/run-ghost-promo/driver.mjs click-dot 1 /tmp/shot.png

# click the card (toggle pause), then screenshot
node .claude/skills/run-ghost-promo/driver.mjs click-card /tmp/shot.png
```

Driver spawns its own Vite dev server on port 4321 and kills it on exit.

## Run — human path

```bash
npm run dev   # http://localhost:5173
```

## Gotchas

- **playwright must be pinned to 1.56.1** — matches the pre-installed browser
  at `/opt/pw-browsers/chromium-1194`. A newer version expects a different
  revision and fails to launch.
- **Never use `npx vite`** to start the server in the driver — `npx` spawns a
  child that survives `proc.kill()`, leaving port 4321 stuck. The driver uses
  `node_modules/.bin/vite` directly with `detached: true` and kills via
  `process.kill(-pid, SIGKILL)`.
- **Dot selector needs a space**: `div[style*="border-radius: 1px"]` —
  browsers serialize inline styles with a space after the colon.
- `npm run lint` has a pre-existing warning on `setActivePad(null)` inside
  an effect (`react-hooks/set-state-in-effect`). Doesn't block build or run.

## Troubleshooting

- `Port 4321 already in use` → `pkill -9 -f vite` and retry
- `Executable doesn't exist` → wrong playwright version; reinstall `playwright@1.56.1`
