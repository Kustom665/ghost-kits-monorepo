import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLIPS_BUCKET } from "@/lib/supabase/env";

// Redirects to a short-lived signed URL for the rendered clip (RLS confirms ownership first).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: clip } = await supabase.from("clips").select("*").eq("id", id).maybeSingle();
  if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (clip.status !== "DONE" || !clip.storage_path) return NextResponse.json({ error: "Clip is not ready" }, { status: 409 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const safeName = clip.title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "clip";
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(CLIPS_BUCKET)
    .createSignedUrl(clip.storage_path, 3600, download ? { download: `${safeName}.mp4` } : undefined);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not sign URL" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, 302);
}
