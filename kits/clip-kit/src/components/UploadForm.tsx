"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Phase = "idle" | "preparing" | "uploading" | "finishing" | "error";

function probeDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(el.src);
      resolve(Number.isFinite(el.duration) ? el.duration : undefined);
    };
    el.onerror = () => resolve(undefined);
    el.src = URL.createObjectURL(file);
  });
}

export default function UploadForm() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [upgrade, setUpgrade] = useState(false);
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) return;
    setError("");
    setUpgrade(false);
    setPhase("preparing");

    try {
      const durationSec = await probeDuration(file);
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, title, mimeType: file.type, durationSec }),
      });
      const data = (await res.json()) as { error?: string; upgradeRequired?: boolean; video?: { id: string }; upload?: { path: string; token: string } };
      if (!res.ok || !data.video || !data.upload) {
        setUpgrade(!!data.upgradeRequired);
        throw new Error(data.error ?? "Could not start upload");
      }

      setPhase("uploading");
      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from("videos").uploadToSignedUrl(data.upload.path, data.upload.token, file, { contentType: file.type });
      if (upErr) throw new Error(upErr.message);

      setPhase("finishing");
      const done = await fetch(`/api/videos/${data.video.id}/complete`, { method: "POST" });
      const doneData = (await done.json()) as { error?: string; upgradeRequired?: boolean };
      if (!done.ok) {
        setUpgrade(!!doneData.upgradeRequired);
        throw new Error(doneData.error ?? "Could not finish upload");
      }
      router.push(`/videos/${data.video.id}`);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const busy = phase === "preparing" || phase === "uploading" || phase === "finishing";

  return (
    <form onSubmit={submit} className="rounded-lg border border-zinc-800 p-5">
      <h2 className="mb-3 text-lg font-medium">Upload a video</h2>
      <div className="flex flex-col gap-3 md:flex-row">
        <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,audio/mpeg,audio/wav,audio/x-m4a" required className="text-sm" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm" />
        <button disabled={busy} className="rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">
          {phase === "preparing" ? "Preparing…" : phase === "uploading" ? "Uploading…" : phase === "finishing" ? "Queueing…" : "Make clips"}
        </button>
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-300">
          {error}{" "}
          {upgrade && (
            <Link href="/billing" className="text-emerald-400 underline">
              View plans
            </Link>
          )}
        </p>
      )}
    </form>
  );
}
