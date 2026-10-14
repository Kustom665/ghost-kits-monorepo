import { NextResponse } from "next/server";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VIDEOS_BUCKET } from "@/lib/supabase/env";
import { canUpload } from "@/lib/entitlements";

const ACCEPTED_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "audio/mpeg", "audio/wav", "audio/x-m4a"]);

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("videos")
    .select("*, clips(*)")
    .order("created_at", { ascending: false })
    .order("index", { referencedTable: "clips", ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ videos: data });
}

// Step 1 of upload: create the row and hand back a signed upload URL for the browser.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { filename?: string; title?: string; mimeType?: string; durationSec?: number }
    | null;
  if (!body?.filename || !body.mimeType) return NextResponse.json({ error: "filename and mimeType are required" }, { status: 400 });
  if (!ACCEPTED_TYPES.has(body.mimeType)) return NextResponse.json({ error: `Unsupported file type ${body.mimeType}` }, { status: 415 });

  const gate = await canUpload(user.id, body.durationSec);
  if (!gate.ok) return NextResponse.json({ error: gate.reason, upgradeRequired: true, entitlements: gate.entitlements }, { status: 402 });

  const title = (body.title?.trim() || path.parse(body.filename).name).slice(0, 200);
  const { data: video, error } = await supabase
    .from("videos")
    .insert({ user_id: user.id, title, original_filename: body.filename, mime_type: body.mimeType, duration_sec: body.durationSec ?? null })
    .select("*")
    .single();
  if (error || !video) return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });

  const ext = path.extname(body.filename).toLowerCase() || ".mp4";
  const storagePath = `${user.id}/${video.id}/original${ext}`;
  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage.from(VIDEOS_BUCKET).createSignedUploadUrl(storagePath);
  if (signErr || !signed) return NextResponse.json({ error: signErr?.message ?? "Could not sign upload" }, { status: 500 });

  await supabase.from("videos").update({ storage_path: storagePath }).eq("id", video.id);
  return NextResponse.json({ video: { ...video, storage_path: storagePath }, upload: { path: signed.path, token: signed.token } }, { status: 201 });
}
