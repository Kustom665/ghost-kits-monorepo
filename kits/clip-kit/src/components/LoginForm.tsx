"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else {
      setState("sent");
    }
  }

  if (state === "sent") {
    return <p className="rounded-md border border-zinc-700 bg-zinc-900 p-4 text-sm">Check <strong>{email}</strong> for your sign-in link.</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-emerald-500"
      />
      <button disabled={state === "sending"} className="rounded-md bg-emerald-500 px-3 py-2 font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">
        {state === "sending" ? "Sending…" : "Email me a link"}
      </button>
      {state === "error" && <p className="text-sm text-red-300">{message}</p>}
    </form>
  );
}
