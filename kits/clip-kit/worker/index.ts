import "dotenv/config";
import { createAdminClient } from "../src/lib/supabase/admin";
import { processVideo } from "../src/lib/pipeline";

// Single-process poller: claims the oldest UPLOADED video and runs the pipeline.
const POLL_MS = 4000;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const admin = createAdminClient();
    const { data: next } = await admin
      .from("videos")
      .select("id")
      .eq("status", "UPLOADED")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) {
      console.log(`[worker] processing ${next.id}`);
      await processVideo(next.id).catch((e) => console.error(`[worker] ${next.id} failed:`, e instanceof Error ? e.message : e));
    }
  } catch (e) {
    console.error("[worker] poll error", e);
  } finally {
    running = false;
  }
}

console.log("[worker] started");
tick();
setInterval(tick, POLL_MS);
