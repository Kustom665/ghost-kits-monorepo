import type { ClipStatus, VideoStatus } from "@/lib/supabase/types";

const LABELS: Record<VideoStatus | ClipStatus, string> = {
  UPLOADING: "Uploading",
  UPLOADED: "Queued",
  EXTRACTING_AUDIO: "Extracting audio",
  TRANSCRIBING: "Transcribing",
  SELECTING_CLIPS: "Finding highlights",
  RENDERING: "Rendering",
  PENDING: "Pending",
  DONE: "Done",
  FAILED: "Failed",
};

export default function StatusBadge({ status }: { status: VideoStatus | ClipStatus }) {
  const tone = status === "DONE" ? "bg-emerald-900 text-emerald-200" : status === "FAILED" ? "bg-red-900 text-red-200" : "bg-zinc-800 text-zinc-300";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{LABELS[status]}</span>;
}
