import "dotenv/config";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { renderClip } from "../src/lib/render";
import { resolveCaptionStyle } from "../src/lib/captions";
import type { TranscriptWord } from "../src/lib/transcribe";

// Renders clips from an existing transcript + clip list, no DB or AI needed.
// Usage: npx tsx scripts/demo-render.ts <video> <words.json> <clips.json> <outDir> [style]
async function main() {
  const [video, wordsPath, clipsPath, outDir, style] = process.argv.slice(2);
  if (!video || !wordsPath || !clipsPath || !outDir) {
    console.error("usage: demo-render <video> <words.json> <clips.json> <outDir> [karaoke|boxed|pop|minimal]");
    process.exit(1);
  }
  const words = JSON.parse(await readFile(wordsPath, "utf8")) as TranscriptWord[];
  const clips = JSON.parse(await readFile(clipsPath, "utf8")) as { title: string; startSec: number; endSec: number }[];
  await mkdir(outDir, { recursive: true });
  const captionStyle = resolveCaptionStyle(style);
  for (const [i, clip] of clips.entries()) {
    const outputPath = path.join(outDir, `clip-${i + 1}-${captionStyle}.mp4`);
    await renderClip({ sourcePath: video, outputPath, startSec: clip.startSec, endSec: clip.endSec, words, captionStyle });
    console.log(`rendered ${outputPath} (${clip.title})`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
