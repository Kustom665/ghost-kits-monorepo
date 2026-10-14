"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import StatusBadge from "./StatusBadge";
import type { VideoDTO } from "@/lib/dto";
import { isTerminalStatus } from "@/lib/dto";

export default function VideoList() {
  const [videos, setVideos] = useState<VideoDTO[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/videos");
      if (!res.ok) return;
      const data = (await res.json()) as { videos: VideoDTO[] };
      if (alive) setVideos(data.videos);
    };
    load();
    const t = setInterval(() => {
      if (videos?.every((v) => isTerminalStatus(v.status))) return;
      load();
    }, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!videos) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (!videos.length) return <p className="text-sm text-zinc-500">No videos yet. Upload one above.</p>;

  return (
    <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
      {videos.map((v) => (
        <li key={v.id}>
          <Link href={`/videos/${v.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-900">
            <div className="min-w-0">
              <p className="truncate font-medium">{v.title}</p>
              <p className="text-xs text-zinc-500">
                {new Date(v.created_at).toLocaleString()} · {v.clips.filter((c) => c.status === "DONE").length} clips
              </p>
            </div>
            <StatusBadge status={v.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
