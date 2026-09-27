import type { PlanTier } from "./supabase/types";

export type PlanLimits = {
  videosPerMonth: number;
  maxDurationSec: number;
  clipsPerVideo: number;
};

export type PlanDefinition = {
  id: PlanTier;
  name: string;
  priceMonthlyUsd: number;
  tagline: string;
  limits: PlanLimits;
  features: string[];
};

export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthlyUsd: 0,
    tagline: "Try the pipeline on short videos.",
    limits: { videosPerMonth: 3, maxDurationSec: 20 * 60, clipsPerVideo: 3 },
    features: ["3 videos / month", "Up to 20 minutes each", "3 clips per video", "Karaoke captions"],
  },
  creator: {
    id: "creator",
    name: "Creator",
    priceMonthlyUsd: 19,
    tagline: "For weekly podcasts and streams.",
    limits: { videosPerMonth: 30, maxDurationSec: 2 * 60 * 60, clipsPerVideo: 5 },
    features: ["30 videos / month", "Up to 2 hours each", "5 clips per video", "All caption styles"],
  },
  studio: {
    id: "studio",
    name: "Studio",
    priceMonthlyUsd: 49,
    tagline: "For teams and agencies.",
    limits: { videosPerMonth: 200, maxDurationSec: 4 * 60 * 60, clipsPerVideo: 8 },
    features: ["200 videos / month", "Up to 4 hours each", "8 clips per video", "All caption styles", "Priority rendering"],
  },
};

export const PAID_PLANS: PlanTier[] = ["creator", "studio"];

export function priceIdForPlan(plan: PlanTier): string | null {
  if (plan === "creator") return process.env.STRIPE_PRICE_CREATOR ?? null;
  if (plan === "studio") return process.env.STRIPE_PRICE_STUDIO ?? null;
  return null;
}

export function planForPriceId(priceId: string | null | undefined): PlanTier {
  if (!priceId) return "free";
  if (priceId === process.env.STRIPE_PRICE_CREATOR) return "creator";
  if (priceId === process.env.STRIPE_PRICE_STUDIO) return "studio";
  return "free";
}

export function formatPrice(usd: number): string {
  return usd === 0 ? "$0" : `$${usd}/mo`;
}
