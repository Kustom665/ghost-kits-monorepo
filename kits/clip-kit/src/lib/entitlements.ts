import { createAdminClient } from "./supabase/admin";
import type { PlanTier, ProfileRow } from "./supabase/types";
import { PLANS, type PlanLimits } from "./plans";

const GRACE_DAYS = 3;

// A paid plan lapses back to free once the Stripe period has ended plus a short grace
// window (in case a renewal webhook is late).
export function effectivePlan(profile: Pick<ProfileRow, "plan" | "current_period_end"> | null): PlanTier {
  if (!profile || profile.plan === "free") return "free";
  if (!profile.current_period_end) return profile.plan;
  const end = new Date(profile.current_period_end).getTime() + GRACE_DAYS * 86_400_000;
  return Date.now() <= end ? profile.plan : "free";
}

export type Entitlements = {
  plan: PlanTier;
  limits: PlanLimits;
  videosThisMonth: number;
  videosRemaining: number;
};

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const admin = createAdminClient();
  const [{ data: profile }, { count }] = await Promise.all([
    admin.from("profiles").select("plan, current_period_end").eq("id", userId).maybeSingle(),
    admin
      .from("videos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .neq("status", "FAILED")
      .gte("created_at", monthStartUtc().toISOString()),
  ]);
  const plan = effectivePlan(profile);
  const limits = PLANS[plan].limits;
  const videosThisMonth = count ?? 0;
  return { plan, limits, videosThisMonth, videosRemaining: Math.max(0, limits.videosPerMonth - videosThisMonth) };
}

export async function canUpload(
  userId: string,
  durationSec?: number | null,
): Promise<{ ok: boolean; reason?: string; entitlements: Entitlements }> {
  const entitlements = await getEntitlements(userId);
  if (entitlements.videosRemaining <= 0) {
    return {
      ok: false,
      reason: `You've used all ${entitlements.limits.videosPerMonth} videos on the ${PLANS[entitlements.plan].name} plan this month.`,
      entitlements,
    };
  }
  if (durationSec && durationSec > entitlements.limits.maxDurationSec) {
    return {
      ok: false,
      reason: `Videos on the ${PLANS[entitlements.plan].name} plan are limited to ${Math.round(entitlements.limits.maxDurationSec / 60)} minutes.`,
      entitlements,
    };
  }
  return { ok: true, entitlements };
}

function monthStartUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
