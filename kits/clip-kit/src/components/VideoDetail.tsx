"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ClipCard from "./ClipCard";
import StatusBadge from "./StatusBadge";
import type { VideoDTO } from "@/lib/dto";
import { isTerminalStatus } from "@/lib/dto";
import type { VideoStatus } from "@/lib/supabase/types";

const STEPS: VideoStatus[] = ["UPLOADED", "EXTRACTING_AUDIO", "TRANSCRIBING", "SELECTING_CLIPS", "RENDERING", "DONE"];

export default function VideoDetail({ initial }: { initial: VideoDTO }) {
  const [video, setVideo] = useState(initial);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (isTerminalStatus(video.status)) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/videos/${video.id}`);
      if (res.ok) setVideo(((await res.json()) as { video: VideoDTO }).video);
    }, 3000);
    return () => clearInterval(t);
  }, [video.id, video.status]);

  async function remove() {
    if (!confirm("Delete this video and all its clips?")) return;
    setDeleting(true);
    await fetch(`/api/videos/${video.id}`, { method: "DELETE" });
    router.push("/");
  }

  const stepIndex = STEPS.indexOf(video.status);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{video.title}</h1>
          <p className="text-sm text-zinc-500">
            {video.original_filename}
            {video.duration_sec ? ` · ${Math.round(video.duration_sec / 60)} min` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={video.status} />
          <button onClick={remove} disabled={deleting} className="text-sm text-zinc-400 hover:text-red-300">
            Delete
          </button>
        </div>
      </div>

      {video.status !== "FAILED" && video.status !== "DONE" && (
        <ol className="mt-6 flex flex-wrap gap-2 text-xs">
          {STEPS.slice(0, -1).map((s, i) => (
            <li key={s} className={`rounded-full px-3 py-1 ${i < stepIndex ? "bg-emerald-900 text-emerald-200" : i === stepIndex ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-zinc-500"}`}>
              {s.replace(/_/g, " ").toLowerCase()}
            </li>
          ))}
        </ol>
      )}

      {video.error_message && <p className="mt-4 rounded-md border border-red-800 bg-red-950 p-3 text-sm text-red-200">{video.error_message}</p>}

      {video.clips.length > 0 && (
        <section className="mt-8 space-y-4">
          <h2 className="text-lg font-medium">Clips</h2>
          {video.clips.map((c) => (
            <ClipCard key={c.id} clip={c} />
          ))}
        </section>
      )}

      {video.transcript_text && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-zinc-400">Transcript</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{video.transcript_text}</p>
        </details>
      )}
    </div>
  );
}
