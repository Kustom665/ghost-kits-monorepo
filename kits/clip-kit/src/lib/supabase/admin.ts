import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./env";

// Service-role client: bypasses RLS. Only for the worker, the Stripe webhook and
// server-side storage signing. Never import from client components.
export function createAdminClient() {
  return createClient<Database>(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
