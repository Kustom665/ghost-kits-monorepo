import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function resolveBinary(kind: "ffmpeg" | "ffprobe"): string {
  const override = process.env[kind === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"];
  if (override) return override;
  try {
    if (kind === "ffmpeg") {
      const p = require("ffmpeg-static") as string | null;
      if (p) return p;
    } else {
      const p = (require("ffprobe-static") as { path?: string }).path;
      if (p) return p;
    }
  } catch {
    // fall through to PATH lookup
  }
  return kind;
}

export const FFMPEG_BIN = resolveBinary("ffmpeg");
export const FFPROBE_BIN = resolveBinary("ffprobe");

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${bin} exited with ${code}: ${err.trim().slice(-2000)}`));
    });
  });
}

export function runFfmpeg(args: string[]): Promise<string> {
  return run(FFMPEG_BIN, ["-y", "-hide_banner", "-loglevel", "error", ...args]);
}

export async function getDurationSec(file: string): Promise<number> {
  const out = await run(FFPROBE_BIN, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const d = parseFloat(out.trim());
  if (!Number.isFinite(d)) throw new Error(`Could not read duration of ${file}`);
  return d;
}

export async function getVideoDimensions(file: string): Promise<{ width: number; height: number }> {
  const out = await run(FFPROBE_BIN, [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file,
  ]);
  const [w, h] = out.trim().split(",").map(Number);
  if (!w || !h) throw new Error(`Could not read dimensions of ${file}`);
  return { width: w, height: h };
}

// 16 kHz mono wav: what Whisper wants, and small enough to ship to the API.
export async function extractAudioForTranscription(input: string, output: string): Promise<void> {
  await runFfmpeg(["-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output]);
}
