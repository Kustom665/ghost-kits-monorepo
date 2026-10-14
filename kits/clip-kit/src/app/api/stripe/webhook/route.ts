import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { planForPriceId } from "@/lib/plans";
import { required } from "@/lib/supabase/env";

// The webhook is the single writer of plan state. Everything else only reads profiles.plan.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, required("STRIPE_WEBHOOK_SECRET"));
  } catch (e) {
    return NextResponse.json({ error: `Invalid signature: ${e instanceof Error ? e.message : e}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe().subscriptions.retrieve(subId);
          await applySubscription(sub, session.metadata?.supabase_user_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object);
        break;
      case "invoice.payment_failed": {
        // Keep the plan until Stripe cancels; the grace window in entitlements covers the gap.
        console.warn(`[stripe] payment failed for customer ${event.data.object.customer}`);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[stripe] webhook handler failed", e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function applySubscription(sub: Stripe.Subscription, userIdHint?: string) {
  const admin = createAdminClient();
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  let userId: string | undefined = userIdHint ?? sub.metadata?.supabase_user_id;
  if (!userId) {
    const { data } = await admin.from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    userId = data?.id ?? undefined;
  }
  if (!userId) {
    console.warn(`[stripe] no profile for customer ${customerId}`);
    return;
  }

  const item = sub.items.data[0];
  const active = sub.status === "active" || sub.status === "trialing";
  const plan = active ? planForPriceId(item?.price.id) : "free";
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null;

  const { error } = await admin
    .from("profiles")
    .update({ plan, stripe_customer_id: customerId, stripe_subscription_id: active ? sub.id : null, current_period_end: active ? periodEnd : null })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}
