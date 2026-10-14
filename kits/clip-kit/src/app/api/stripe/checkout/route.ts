import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl, stripe } from "@/lib/stripe";
import { PAID_PLANS, priceIdForPlan } from "@/lib/plans";
import type { PlanTier } from "@/lib/supabase/types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { plan?: PlanTier } | null;
  const plan = body?.plan;
  if (!plan || !PAID_PLANS.includes(plan)) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  const priceId = priceIdForPlan(plan);
  if (!priceId) return NextResponse.json({ error: `STRIPE_PRICE_${plan.toUpperCase()} is not configured` }, { status: 500 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();

  let customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe().customers.create({ email: user.email ?? undefined, metadata: { supabase_user_id: user.id } });
    customerId = customer.id;
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: appUrl("/billing?checkout=success"),
    cancel_url: appUrl("/billing?checkout=cancelled"),
    allow_promotion_codes: true,
    metadata: { supabase_user_id: user.id, plan },
    subscription_data: { metadata: { supabase_user_id: user.id, plan } },
  });
  return NextResponse.json({ url: session.url });
}
