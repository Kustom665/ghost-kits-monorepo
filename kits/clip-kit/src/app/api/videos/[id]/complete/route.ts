import { NextResponse } from "next/server";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VIDEOS_BUCKET } from "@/lib/supabase/env";
import { canUpload } from "@/lib/entitlements";

// Step 2 of upload: the browser finished the direct-to-storage upload; verify the object
// exists, then flip the row to UPLOADED so the worker picks it up.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: video } = await supabase.from("videos").select("*").eq("id", id).maybeSingle();
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (video.status !== "UPLOADING") return NextResponse.json({ video });
  if (!video.storage_path) return NextResponse.json({ error: "Video has no storage path" }, { status: 409 });

  const admin = createAdminClient();
  const dir = path.dirname(video.storage_path);
  const filename = path.basename(video.storage_path);
  const { data: objects } = await admin.storage.from(VIDEOS_BUCKET).list(dir, { search: filename });
  if (!objects?.some((o) => o.name === filename)) return NextResponse.json({ error: "Upload not found in storage" }, { status: 409 });

  const gate = await canUpload(user.id, video.duration_sec);
  if (!gate.ok) {
    await supabase.from("videos").update({ status: "FAILED", error_message: gate.reason }).eq("id", id);
    return NextResponse.json({ error: gate.reason, upgradeRequired: true }, { status: 402 });
  }

  const { data: updated, error } = await supabase.from("videos").update({ status: "UPLOADED" }).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ video: updated });
}
