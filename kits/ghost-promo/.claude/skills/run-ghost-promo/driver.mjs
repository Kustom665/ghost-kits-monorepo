#!/usr/bin/env node
// Driver for ghost-promo: starts the Vite dev server, opens headless Chromium,
// and runs one interaction command, then tears down cleanly.
//
// Usage (from kits/ghost-promo/):
//   node .claude/skills/run-ghost-promo/driver.mjs screenshot <out.png>
//   node .claude/skills/run-ghost-promo/driver.mjs click-dot <index 0-4> <out.png>
//   node .claude/skills/run-ghost-promo/driver.mjs click-card <out.png>

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "../../../");
const PORT = 4321;
const URL = `http://localhost:${PORT}`;

function startServer() {
  const viteBin = path.join(appDir, "node_modules", ".bin", "vite");
  const proc = spawn(viteBin, ["--port", String(PORT), "--strictPort"], {
    cwd: appDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  return new Promise((resolve, reject) => {
    let out = "";
    let timer;
    const onData = (d) => {
      out += d.toString();
      if (out.includes("ready in") || out.includes("Local:")) {
        clearTimeout(timer);
        proc.stdout.off("data", onData);
        resolve(proc);
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", (d) => (out += d.toString()));
    proc.on("error", reject);
    timer = setTimeout(() => reject(new Error("vite timed out:\n" + out)), 15000);
  });
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) { console.error("Usage: driver.mjs <screenshot|click-dot|click-card> ..."); process.exit(1); }

  const server = await startServer();
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { server.kill("SIGKILL"); }
    throw e;
  }
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 760 } });
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Click to pause");

    if (cmd === "screenshot") {
      const out = args[0] || "screenshot.png";
      await page.screenshot({ path: out });
      console.log("wrote", out);
    } else if (cmd === "click-dot") {
      const idx = Number(args[0] ?? 0);
      const out = args[1] || "screenshot.png";
      // dots render as: div[style*="border-radius: 1px"] (browser serializes with space)
      await page.locator('div[style*="border-radius: 1px"]').nth(idx).click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: out });
      console.log("wrote", out);
    } else if (cmd === "click-card") {
      const out = args[0] || "screenshot.png";
      await page.locator('[style*="cursor: pointer"]').first().click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: out });
      console.log("wrote", out);
    } else {
      console.error("Unknown command:", cmd); process.exitCode = 1;
    }
  } finally {
    await browser.close();
    try { process.kill(-server.pid, "SIGKILL"); } catch { server.kill("SIGKILL"); }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
