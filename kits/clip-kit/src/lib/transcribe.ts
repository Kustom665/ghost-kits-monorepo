import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createReadStream } from "node:fs";
import OpenAI from "openai";
import { getDurationSec, runFfmpeg } from "./ffmpeg";

export type TranscriptWord = { word: string; start: number; end: number };
export type TranscriptResult = { text: string; words: TranscriptWord[] };

export type WhisperProvider = "openai" | "local";

export function resolveProvider(): WhisperProvider {
  const configured = process.env.WHISPER_PROVIDER as WhisperProvider | undefined;
  if (configured === "openai" || configured === "local") return configured;
  return process.env.OPENAI_API_KEY ? "openai" : "local";
}

export async function transcribe(wavPath: string): Promise<TranscriptResult> {
  return resolveProvider() === "openai" ? transcribeWithOpenAI(wavPath) : transcribeWithLocalWhisper(wavPath);
}

// --- OpenAI whisper-1 (chunked; the API caps uploads at 25 MB) -------------

const CHUNK_SEC = 600;

async function transcribeWithOpenAI(wavPath: string): Promise<TranscriptResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const duration = await getDurationSec(wavPath);
  const tmp = await mkdtemp(path.join(tmpdir(), "clipkit-whisper-"));
  try {
    const words: TranscriptWord[] = [];
    const texts: string[] = [];
    for (let offset = 0; offset < duration; offset += CHUNK_SEC) {
      const chunk = path.join(tmp, `chunk-${offset}.wav`);
      await runFfmpeg(["-ss", String(offset), "-t", String(CHUNK_SEC), "-i", wavPath, "-c", "copy", chunk]);
      const res = await client.audio.transcriptions.create({
        file: createReadStream(chunk),
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["word"],
      });
      texts.push(res.text);
      for (const w of res.words ?? []) {
        words.push({ word: w.word.trim(), start: w.start + offset, end: w.end + offset });
      }
    }
    return { text: texts.join(" ").trim(), words };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// --- Local openai-whisper CLI (`pip install openai-whisper`) ---------------

type LocalWhisperJson = {
  text: string;
  segments: { words?: { word: string; start: number; end: number }[] }[];
};

async function transcribeWithLocalWhisper(wavPath: string): Promise<TranscriptResult> {
  const bin = process.env.WHISPER_BIN ?? "whisper";
  const model = process.env.WHISPER_MODEL ?? "base";
  const tmp = await mkdtemp(path.join(tmpdir(), "clipkit-whisper-"));
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        bin,
        [wavPath, "--model", model, "--word_timestamps", "True", "--output_format", "json", "--output_dir", tmp, "--verbose", "False"],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let err = "";
      child.stderr.on("data", (d) => (err += d));
      child.on("error", (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") {
          reject(new Error(`Local whisper binary "${bin}" not found. Run \`pip install openai-whisper\` or set WHISPER_PROVIDER=openai.`));
        } else reject(e);
      });
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`whisper exited with ${code}: ${err.slice(-2000)}`))));
    });
    const jsonPath = path.join(tmp, `${path.parse(wavPath).name}.json`);
    const parsed = JSON.parse(await readFile(jsonPath, "utf8")) as LocalWhisperJson;
    const words: TranscriptWord[] = [];
    for (const seg of parsed.segments) {
      for (const w of seg.words ?? []) {
        const word = w.word.trim();
        if (word) words.push({ word, start: w.start, end: w.end });
      }
    }
    return { text: parsed.text.trim(), words };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
