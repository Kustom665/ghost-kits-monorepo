"use client";

import { useState } from "react";
import { PLANS, formatPrice } from "@/lib/plans";
import type { PlanTier } from "@/lib/supabase/types";

export default function PlanPicker({ currentPlan, hasBillingAccount }: { currentPlan: PlanTier; hasBillingAccount: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function go(endpoint: string, body?: unknown) {
    setBusy(endpoint + JSON.stringify(body ?? ""));
    setError("");
    const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.ok && data.url) window.location.assign(data.url);
    else {
      setError(data.error ?? "Something went wrong");
      setBusy(null);
    }
  }

  return (
    <div className="mt-8">
      <div className="grid gap-4 md:grid-cols-3">
        {Object.values(PLANS).map((plan) => {
          const current = plan.id === currentPlan;
          return (
            <div key={plan.id} className={`rounded-lg border p-5 ${current ? "border-emerald-500" : "border-zinc-800"}`}>
              <h2 className="text-lg font-medium">{plan.name}</h2>
              <p className="text-2xl font-semibold">{formatPrice(plan.priceMonthlyUsd)}</p>
              <p className="mb-4 text-sm text-zinc-400">{plan.tagline}</p>
              <ul className="mb-4 space-y-1 text-sm text-zinc-300">
                {plan.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              {current ? (
                <span className="text-sm text-emerald-400">Current plan</span>
              ) : plan.id === "free" ? (
                hasBillingAccount && (
                  <button onClick={() => go("/api/stripe/portal")} disabled={!!busy} className="text-sm text-zinc-300 underline">
                    Cancel in billing portal
                  </button>
                )
              ) : (
                <button
                  onClick={() => go("/api/stripe/checkout", { plan: plan.id })}
                  disabled={!!busy}
                  className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {currentPlan === "free" ? "Upgrade" : "Switch"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {hasBillingAccount && (
        <button onClick={() => go("/api/stripe/portal")} disabled={!!busy} className="mt-6 text-sm text-zinc-300 underline">
          Manage payment method, invoices and cancellation
        </button>
      )}
      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
    </div>
  );
}
