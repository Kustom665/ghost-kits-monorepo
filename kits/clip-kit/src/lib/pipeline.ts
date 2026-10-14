import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAdminClient } from "./supabase/admin";
import { CLIPS_BUCKET, VIDEOS_BUCKET } from "./supabase/env";
import type { Json, VideoStatus } from "./supabase/types";
import { PLANS } from "./plans";
import { effectivePlan } from "./entitlements";
import { extractAudioForTranscription, getDurationSec } from "./ffmpeg";
import { transcribe, type TranscriptResult, type TranscriptWord } from "./transcribe";
import { selectHighlights, type ClipCandidate } from "./highlights";
import { renderClip } from "./render";
import { resolveCaptionStyle } from "./captions";

export type PipelineDeps = {
  transcribe: (wavPath: string) => Promise<TranscriptResult>;
  select: (words: TranscriptWord[], opts: { maxClips: number; durationSec: number; log?: (m: string) => void }) => Promise<ClipCandidate[]>;
  log?: (msg: string) => void;
};

export const defaultDeps: PipelineDeps = {
  transcribe,
  select: selectHighlights,
  log: (m) => console.log(`[pipeline] ${m}`),
};

// Runs one uploaded video through the whole pipeline. Status transitions are written
// to the DB as they happen so the UI can poll them.
export async function processVideo(videoId: string, deps: PipelineDeps = defaultDeps): Promise<void> {
  const admin = createAdminClient();
  const log = deps.log ?? (() => {});

  const { data: video, error } = await admin.from("videos").select("*").eq("id", videoId).single();
  if (error || !video) throw new Error(`Video ${videoId} not found: ${error?.message}`);
  if (!video.storage_path) throw new Error(`Video ${videoId} has no storage path`);

  const { data: profile } = await admin.from("profiles").select("plan, current_period_end").eq("id", video.user_id).maybeSingle();
  const limits = PLANS[effectivePlan(profile)].limits;

  const setStatus = async (status: VideoStatus, extra: Record<string, unknown> = {}) => {
    log(`${videoId} → ${status}`);
    const { error: e } = await admin.from("videos").update({ status, ...extra }).eq("id", videoId);
    if (e) throw new Error(`Failed to update status: ${e.message}`);
  };

  const tmp = await mkdtemp(path.join(tmpdir(), "clipkit-"));
  try {
    const sourcePath = path.join(tmp, `source${path.extname(video.storage_path) || ".mp4"}`);
    const { data: blob, error: dlErr } = await admin.storage.from(VIDEOS_BUCKET).download(video.storage_path);
    if (dlErr || !blob) throw new Error(`Download failed: ${dlErr?.message}`);
    await writeFile(sourcePath, Buffer.from(await blob.arrayBuffer()));

    await setStatus("EXTRACTING_AUDIO");
    const durationSec = await getDurationSec(sourcePath);
    if (durationSec > limits.maxDurationSec) {
      throw new Error(`Video is ${Math.round(durationSec / 60)} min; your plan allows ${Math.round(limits.maxDurationSec / 60)} min.`);
    }
    const wavPath = path.join(tmp, "audio.wav");
    await extractAudioForTranscription(sourcePath, wavPath);

    await setStatus("TRANSCRIBING", { duration_sec: durationSec });
    const transcript = await deps.transcribe(wavPath);
    if (!transcript.words.length) throw new Error("Transcription produced no words (is there speech in this video?)");
    await admin
      .from("videos")
      .update({ transcript_text: transcript.text, transcript_words: transcript.words as unknown as Json })
      .eq("id", videoId);

    await setStatus("SELECTING_CLIPS");
    const candidates = await deps.select(transcript.words, { maxClips: limits.clipsPerVideo, durationSec, log });
    if (!candidates.length) throw new Error("No clip-worthy segments were found.");

    const { data: clips, error: insErr } = await admin
      .from("clips")
      .insert(
        candidates.map((c, i) => ({
          video_id: videoId,
          user_id: video.user_id,
          index: i,
          title: c.title,
          hook: c.hook,
          reasoning: c.reasoning,
          virality_score: c.viralityScore,
          start_sec: c.startSec,
          end_sec: c.endSec,
        })),
      )
      .select("*");
    if (insErr || !clips) throw new Error(`Failed to insert clips: ${insErr?.message}`);

    await setStatus("RENDERING");
    const captionStyle = resolveCaptionStyle();
    for (const clip of clips) {
      await admin.from("clips").update({ status: "RENDERING" }).eq("id", clip.id);
      const outputPath = path.join(tmp, `${clip.id}.mp4`);
      try {
        await renderClip({ sourcePath, outputPath, startSec: clip.start_sec, endSec: clip.end_sec, words: transcript.words, captionStyle });
        const storagePath = `${video.user_id}/${videoId}/${clip.id}.mp4`;
        const { error: upErr } = await admin.storage
          .from(CLIPS_BUCKET)
          .upload(storagePath, await readFile(outputPath), { contentType: "video/mp4", upsert: true });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        await admin.from("clips").update({ status: "DONE", storage_path: storagePath }).eq("id", clip.id);
        log(`clip ${clip.index} rendered (${clip.title})`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await admin.from("clips").update({ status: "FAILED", error_message: message }).eq("id", clip.id);
        log(`clip ${clip.index} failed: ${message}`);
      }
    }

    await setStatus("DONE");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("videos").update({ status: "FAILED", error_message: message }).eq("id", videoId);
    throw e;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
