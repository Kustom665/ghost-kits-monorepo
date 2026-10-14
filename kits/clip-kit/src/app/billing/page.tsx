import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import PlanPicker from "@/components/PlanPicker";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  const user = await requireUser();
  const ent = await getEntitlements(user.id);
  const { data: profile } = await createAdminClient().from("profiles").select("stripe_customer_id, current_period_end").eq("id", user.id).maybeSingle();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
        ← Back
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Billing</h1>
      {checkout === "success" && (
        <p className="mt-4 rounded-md border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Payment received. Your plan updates as soon as Stripe confirms the subscription (usually seconds).
        </p>
      )}
      {checkout === "cancelled" && <p className="mt-4 text-sm text-zinc-400">Checkout cancelled — no charge was made.</p>}
      <p className="mt-2 text-sm text-zinc-400">
        Used {ent.videosThisMonth} of {ent.limits.videosPerMonth} videos this month.
        {profile?.current_period_end && ` Current period ends ${new Date(profile.current_period_end).toLocaleDateString()}.`}
      </p>
      <PlanPicker currentPlan={ent.plan} hasBillingAccount={!!profile?.stripe_customer_id} />
    </main>
  );
}
