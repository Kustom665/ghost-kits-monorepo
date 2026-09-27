import type { TranscriptWord } from "./transcribe";

// ASS caption builder. One preset per look; every preset renders on a 1080x1920 canvas.
export type CaptionStyle = "karaoke" | "boxed" | "pop" | "minimal";

export const CAPTION_STYLES: CaptionStyle[] = ["karaoke", "boxed", "pop", "minimal"];

type Preset = {
  label: string;
  description: string;
  wordsPerLine: number;
  fontSize: number;
  borderStyle: 1 | 3; // 1 = outline+shadow, 3 = opaque box
  outline: number;
  shadow: number;
  alignment: 2 | 5; // 2 = bottom centre, 5 = middle centre
  marginV: number;
  backColour: string;
  highlight: "colour" | "colour+scale" | "none";
};

// ASS colours are &HAABBGGRR (alpha, blue, green, red).
const WHITE = "&H00FFFFFF&";
const HIGHLIGHT = "&H003FD4FF&"; // warm yellow
const BLACK = "&H00000000";

export const PRESETS: Record<CaptionStyle, Preset> = {
  karaoke: {
    label: "Karaoke",
    description: "Big white words, current word lights up yellow.",
    wordsPerLine: 4, fontSize: 72, borderStyle: 1, outline: 5, shadow: 2, alignment: 2, marginV: 320,
    backColour: "&H80000000", highlight: "colour",
  },
  boxed: {
    label: "Boxed",
    description: "Words on a translucent black box, podcast style.",
    wordsPerLine: 3, fontSize: 70, borderStyle: 3, outline: 14, shadow: 0, alignment: 2, marginV: 340,
    backColour: "&H30000000", highlight: "colour",
  },
  pop: {
    label: "Pop",
    description: "Centre-screen, each word scales up as it's spoken.",
    wordsPerLine: 3, fontSize: 78, borderStyle: 1, outline: 6, shadow: 0, alignment: 5, marginV: 0,
    backColour: "&H80000000", highlight: "colour+scale",
  },
  minimal: {
    label: "Minimal",
    description: "Small phrase captions, no per-word highlight.",
    wordsPerLine: 6, fontSize: 52, borderStyle: 1, outline: 2, shadow: 1, alignment: 2, marginV: 180,
    backColour: "&H80000000", highlight: "none",
  },
};

const FONT = process.env.CLIPKIT_CAPTION_FONT ?? "Liberation Sans";
const SIZE_OVERRIDE = process.env.CLIPKIT_CAPTION_SIZE ? Number(process.env.CLIPKIT_CAPTION_SIZE) : null;
const PAUSE_BREAK_SEC = 0.6;

export function resolveCaptionStyle(value?: string | null): CaptionStyle {
  const v = (value ?? process.env.CLIPKIT_CAPTION_STYLE ?? "karaoke").toLowerCase();
  return (CAPTION_STYLES as string[]).includes(v) ? (v as CaptionStyle) : "karaoke";
}

export function buildAssCaptions(
  words: TranscriptWord[],
  clipStart: number,
  clipEnd: number,
  style: CaptionStyle = resolveCaptionStyle(),
): string {
  const p = PRESETS[style];
  const size = SIZE_OVERRIDE ?? p.fontSize;
  const inClip = words
    .filter((w) => w.end > clipStart && w.start < clipEnd)
    .map((w) => ({ ...w, start: Math.max(0, w.start - clipStart), end: Math.min(clipEnd - clipStart, w.end - clipStart) }));

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Caption,${FONT},${size},${WHITE},${HIGHLIGHT},${BLACK},${p.backColour},-1,0,0,0,100,100,0,0,${p.borderStyle},${p.outline},${p.shadow},${p.alignment},80,80,${p.marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events: string[] = [];
  for (const line of groupIntoLines(inClip, p.wordsPerLine)) {
    if (p.highlight === "none") {
      const text = line.map((w) => escapeAssText(w.word)).join(" ");
      events.push(`Dialogue: 0,${fmt(line[0].start)},${fmt(line[line.length - 1].end)},Caption,,0,0,0,,${text}`);
      continue;
    }
    // One event per word so the highlight moves with speech; the line stays put.
    for (let i = 0; i < line.length; i++) {
      const start = line[i].start;
      const end = i + 1 < line.length ? line[i + 1].start : line[i].end;
      if (end <= start) continue;
      const text = line
        .map((w, j) => {
          const t = escapeAssText(w.word);
          if (j !== i) return t;
          return p.highlight === "colour+scale"
            ? `{\\c${HIGHLIGHT}\\fscx130\\fscy130}${t}{\\c${WHITE}\\fscx100\\fscy100}`
            : `{\\c${HIGHLIGHT}}${t}{\\c${WHITE}}`;
        })
        .join(" ");
      events.push(`Dialogue: 0,${fmt(start)},${fmt(end)},Caption,,0,0,0,,${text}`);
    }
  }
  return [...header, ...events, ""].join("\n");
}

function groupIntoLines(words: TranscriptWord[], perLine: number): TranscriptWord[][] {
  const lines: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  for (const w of words) {
    const prev = current[current.length - 1];
    if (current.length >= perLine || (prev && w.start - prev.end > PAUSE_BREAK_SEC)) {
      lines.push(current);
      current = [];
    }
    current.push(w);
  }
  if (current.length) lines.push(current);
  return lines;
}

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

export function escapeAssText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, " ");
}
