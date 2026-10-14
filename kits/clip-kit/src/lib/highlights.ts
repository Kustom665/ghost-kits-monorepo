import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { TranscriptWord } from "./transcribe";

export type ClipCandidate = {
  title: string;
  hook: string;
  reasoning: string;
  viralityScore: number;
  startSec: number;
  endSec: number;
};

const TARGET_MIN_SEC = 30;
const TARGET_MAX_SEC = 60;
const ACCEPT_MIN_SEC = 20;
const HARD_MAX_SEC = 75;

// Anthropic direct or OpenRouter (OpenAI-compatible). Auto: prefer Anthropic if its key is set.
export type SelectorProvider = "anthropic" | "openrouter";

export function resolveSelectorProvider(): SelectorProvider {
  const configured = process.env.CLIP_SELECTOR_PROVIDER as SelectorProvider | undefined;
  if (configured === "anthropic" || configured === "openrouter") return configured;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return "anthropic";
}

const ANTHROPIC_MODEL = process.env.CLIP_SELECTOR_MODEL ?? "claude-opus-5";
const OPENROUTER_MODEL = process.env.CLIP_SELECTOR_MODEL ?? "anthropic/claude-sonnet-5";

export const CLIP_SCHEMA = {
  type: "object",
  properties: {
    clips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string", description: "Punchy, under 60 characters." },
          hook: { type: "string", description: "The first spoken line that will stop the scroll." },
          score: { type: "integer", minimum: 0, maximum: 100 },
          reasoning: { type: "string" },
          start_time: { type: "number" },
          end_time: { type: "number" },
        },
        required: ["id", "title", "hook", "score", "reasoning", "start_time", "end_time"],
        additionalProperties: false,
      },
    },
  },
  required: ["clips"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an expert short-form video editor who finds the moments in long-form content that go viral on TikTok, Reels and Shorts.

Given a timestamped transcript, select the best segments to cut into vertical clips.

What makes a great clip:
- A strong hook in the first 3 seconds: a bold claim, a surprising fact, a question, a confession, or a punchline setup.
- A complete thought or story arc that stands alone without context from the rest of the video.
- Emotional charge: humor, outrage, inspiration, vulnerability, controversy, or a "wait, what?" moment.
- Quotable, specific language rather than vague generalities.
- Natural sentence boundaries at the start and end. Never cut mid-sentence.

Rules:
- Each clip should be ${TARGET_MIN_SEC}-${TARGET_MAX_SEC} seconds. Never shorter than ${ACCEPT_MIN_SEC}s or longer than ${HARD_MAX_SEC}s.
- Clips must not overlap.
- start_time and end_time are seconds into the video and must lie within the transcript.
- The hook must be words actually spoken in the clip, not something you invent.
- Score 0-100 for viral potential. Be honest: most segments score below 60. Reserve 85+ for genuinely exceptional moments.
- Return the clips in descending score order.`;

export type SelectHighlightsOptions = {
  maxClips?: number;
  durationSec: number;
  log?: (msg: string) => void;
};

export async function selectHighlights(words: TranscriptWord[], opts: SelectHighlightsOptions): Promise<ClipCandidate[]> {
  const maxClips = opts.maxClips ?? 5;
  const transcript = buildTimestampedTranscript(words);
  const userPrompt = `Video duration: ${opts.durationSec.toFixed(1)}s.\nSelect up to ${maxClips} clips.\n\nTranscript (each line starts with its timestamp in seconds):\n\n${transcript}`;

  const provider = resolveSelectorProvider();
  opts.log?.(`Selecting clips via ${provider}`);
  const raw = provider === "openrouter" ? await askOpenRouter(userPrompt) : await askAnthropic(userPrompt);
  const parsed = JSON.parse(raw) as { clips: RawClip[] };

  const candidates = parsed.clips
    .map((c) => normalise(c, words, opts.durationSec))
    .filter((c): c is ClipCandidate => c !== null)
    .sort((a, b) => b.viralityScore - a.viralityScore);
  return dropOverlaps(candidates).slice(0, maxClips);
}

type RawClip = { id: number; title: string; hook: string; score: number; reasoning: string; start_time: number; end_time: number };

async function askAnthropic(userPrompt: string): Promise<string> {
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: ANTHROPIC_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: CLIP_SCHEMA } },
    messages: [{ role: "user", content: userPrompt }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new Error("Clip selection was refused by the model.");
  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Clip selection returned no text.");
  return text.text;
}

async function askOpenRouter(userPrompt: string): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", "X-Title": "Clip Kit" },
  });
  const res = await client.chat.completions.create({
    model: OPENROUTER_MODEL,
    max_tokens: 8000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_schema", json_schema: { name: "clips", strict: true, schema: CLIP_SCHEMA } },
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error(`Clip selection returned no content (finish_reason=${res.choices[0]?.finish_reason}).`);
  return content;
}

// "[724.2] word word word ..." — 12 words per line keeps timestamps dense but readable.
export function buildTimestampedTranscript(words: TranscriptWord[], perLine = 12): string {
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += perLine) {
    const chunk = words.slice(i, i + perLine);
    lines.push(`[${chunk[0].start.toFixed(1)}] ${chunk.map((w) => w.word).join(" ")}`);
  }
  return lines.join("\n");
}

function normalise(c: RawClip, words: TranscriptWord[], durationSec: number): ClipCandidate | null {
  let start = snapToWordBoundary(c.start_time, words, "start");
  let end = snapToWordBoundary(c.end_time, words, "end");
  start = Math.max(0, start);
  end = Math.min(durationSec, end);
  if (end - start < ACCEPT_MIN_SEC) return null;
  if (end - start > HARD_MAX_SEC) end = start + HARD_MAX_SEC;
  return {
    title: c.title.trim().slice(0, 80),
    hook: c.hook.trim(),
    reasoning: c.reasoning.trim(),
    viralityScore: Math.max(0, Math.min(100, Math.round(c.score))),
    startSec: start,
    endSec: end,
  };
}

function snapToWordBoundary(t: number, words: TranscriptWord[], edge: "start" | "end"): number {
  if (!words.length) return t;
  let best = words[0];
  let bestDist = Infinity;
  for (const w of words) {
    const v = edge === "start" ? w.start : w.end;
    const d = Math.abs(v - t);
    if (d < bestDist) {
      best = w;
      bestDist = d;
    }
  }
  // Give a little air: start slightly before the word, end slightly after.
  return edge === "start" ? Math.max(0, best.start - 0.15) : best.end + 0.25;
}

function dropOverlaps(sorted: ClipCandidate[]): ClipCandidate[] {
  const kept: ClipCandidate[] = [];
  for (const c of sorted) {
    if (kept.every((k) => c.endSec <= k.startSec || c.startSec >= k.endSec)) kept.push(c);
  }
  return kept;
}
