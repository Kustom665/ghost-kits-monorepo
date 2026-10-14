import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VideoDetail from "@/components/VideoDetail";
import type { VideoDTO } from "@/lib/dto";

export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("videos")
    .select("*, clips(*)")
    .eq("id", id)
    .order("index", { referencedTable: "clips", ascending: true })
    .maybeSingle();
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
        ← All videos
      </Link>
      <VideoDetail initial={data as VideoDTO} />
    </main>
  );
}
