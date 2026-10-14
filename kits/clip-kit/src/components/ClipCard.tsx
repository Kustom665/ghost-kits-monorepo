import StatusBadge from "./StatusBadge";
import type { ClipRow } from "@/lib/supabase/types";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ClipCard({ clip }: { clip: ClipRow }) {
  const ready = clip.status === "DONE" && clip.storage_path;
  return (
    <div className="flex gap-4 rounded-lg border border-zinc-800 p-4">
      <div className="flex w-[108px] shrink-0 items-center justify-center rounded-md bg-zinc-900" style={{ aspectRatio: "9 / 16" }}>
        {ready ? (
          <video src={`/api/clips/${clip.id}`} controls preload="metadata" className="h-full w-full rounded-md object-cover" />
        ) : (
          <span className="text-xs text-zinc-500">{clip.status === "FAILED" ? "Failed" : "Rendering…"}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium">{clip.title}</h3>
          <span className="shrink-0 rounded-md bg-emerald-950 px-2 py-0.5 text-xs text-emerald-300">{clip.virality_score}/100</span>
        </div>
        <p className="mt-1 text-sm italic text-zinc-300">&ldquo;{clip.hook}&rdquo;</p>
        <p className="mt-2 text-sm text-zinc-400">{clip.reasoning}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span>
            {fmt(clip.start_sec)} – {fmt(clip.end_sec)} ({Math.round(clip.end_sec - clip.start_sec)}s)
          </span>
          <StatusBadge status={clip.status} />
          {ready && (
            <a href={`/api/clips/${clip.id}?download=1`} className="text-emerald-400 hover:underline">
              Download MP4
            </a>
          )}
          {clip.error_message && <span className="text-red-300">{clip.error_message}</span>}
        </div>
      </div>
    </div>
  );
}
