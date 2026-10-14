import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements";
import { PLANS } from "@/lib/plans";
import UploadForm from "@/components/UploadForm";
import VideoList from "@/components/VideoList";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const ent = await getEntitlements(user.id);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Clip Kit</h1>
          <p className="text-sm text-zinc-400">
            {PLANS[ent.plan].name} plan · {ent.videosRemaining} of {ent.limits.videosPerMonth} videos left this month ·{" "}
            <Link href="/billing" className="text-emerald-400 hover:underline">
              {ent.plan === "free" ? "Upgrade" : "Manage billing"}
            </Link>
          </p>
        </div>
        <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm text-zinc-400">
          <span>{user.email}</span>
          <button className="rounded-md border border-zinc-700 px-3 py-1 hover:bg-zinc-800">Sign out</button>
        </form>
      </header>

      <UploadForm />
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-medium">Your videos</h2>
        <VideoList />
      </section>
    </main>
  );
}
