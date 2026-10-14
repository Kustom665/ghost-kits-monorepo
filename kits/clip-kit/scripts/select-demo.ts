import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { selectHighlights, resolveSelectorProvider } from "../src/lib/highlights";
import type { TranscriptWord } from "../src/lib/transcribe";

// Runs only the Claude selection stage on a saved transcript.
// Usage: npx tsx scripts/select-demo.ts <words.json> <out clips.json> [maxClips]
async function main() {
  const [wordsPath, outPath, max] = process.argv.slice(2);
  if (!wordsPath || !outPath) {
    console.error("usage: select-demo <words.json> <clips.json> [maxClips]");
    process.exit(1);
  }
  const words = JSON.parse(await readFile(wordsPath, "utf8")) as TranscriptWord[];
  const durationSec = words[words.length - 1].end;
  console.log(`provider=${resolveSelectorProvider()} words=${words.length} duration=${durationSec.toFixed(1)}s`);
  const clips = await selectHighlights(words, { maxClips: max ? Number(max) : 3, durationSec, log: console.log });
  await writeFile(outPath, JSON.stringify(clips, null, 2));
  for (const c of clips) console.log(`${c.viralityScore.toString().padStart(3)}  ${c.startSec.toFixed(1)}-${c.endSec.toFixed(1)}  ${c.title}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
