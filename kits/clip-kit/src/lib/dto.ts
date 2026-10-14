import type { ClipRow, VideoRow, VideoStatus } from "./supabase/types";

export type VideoDTO = VideoRow & { clips: ClipRow[] };

export function isTerminalStatus(status: VideoStatus): boolean {
  return status === "DONE" || status === "FAILED";
}
