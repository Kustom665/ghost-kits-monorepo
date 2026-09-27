import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildAssCaptions, type CaptionStyle } from "./captions";
import { getVideoDimensions, runFfmpeg } from "./ffmpeg";
import type { TranscriptWord } from "./transcribe";

export type RenderClipOptions = {
  sourcePath: string;
  outputPath: string;
  startSec: number;
  endSec: number;
  words: TranscriptWord[];
  captionStyle?: CaptionStyle;
};

// Cuts [startSec, endSec], crops to 9:16, scales to 1080x1920 and burns in captions.
export async function renderClip(opts: RenderClipOptions): Promise<void> {
  const { width, height } = await getVideoDimensions(opts.sourcePath);
  const crop = width / height > 9 / 16 ? "crop=ih*9/16:ih" : "crop=iw:iw*16/9";

  const tmp = await mkdtemp(path.join(tmpdir(), "clipkit-render-"));
  try {
    const assPath = path.join(tmp, "captions.ass");
    await writeFile(assPath, buildAssCaptions(opts.words, opts.startSec, opts.endSec, opts.captionStyle), "utf8");
    const vf = `${crop},scale=1080:1920:flags=lanczos,setsar=1,subtitles=filename='${escapeForFilter(assPath)}'`;
    await runFfmpeg([
      "-ss", opts.startSec.toFixed(3),
      "-i", opts.sourcePath,
      "-t", (opts.endSec - opts.startSec).toFixed(3),
      "-vf", vf,
      "-c:v", "libx264", "-preset", "fast", "-crf", "18",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      opts.outputPath,
    ]);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function escapeForFilter(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
