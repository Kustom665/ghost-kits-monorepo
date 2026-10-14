import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLIPS_BUCKET, VIDEOS_BUCKET } from "@/lib/supabase/env";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("videos")
    .select("*, clips(*)")
    .eq("id", id)
    .order("index", { referencedTable: "clips", ascending: true })
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ video: data });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: video } = await supabase.from("videos").select("*, clips(*)").eq("id", id).maybeSingle();
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const clipPaths = video.clips.map((c) => c.storage_path).filter((p): p is string => !!p);
  if (clipPaths.length) await admin.storage.from(CLIPS_BUCKET).remove(clipPaths);
  if (video.storage_path) await admin.storage.from(VIDEOS_BUCKET).remove([video.storage_path]);

  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
