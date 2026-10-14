import Stripe from "stripe";
import { required } from "./supabase/env";

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (!cached) cached = new Stripe(required("STRIPE_SECRET_KEY"), { typescript: true });
  return cached;
}

export function appUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}
