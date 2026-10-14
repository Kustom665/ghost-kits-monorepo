import LoginForm from "@/components/LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="mb-2 text-2xl font-semibold">Sign in to Clip Kit</h1>
      <p className="mb-6 text-sm text-zinc-400">We&apos;ll email you a magic link. No password needed.</p>
      {error && <p className="mb-4 rounded-md border border-red-800 bg-red-950 p-3 text-sm text-red-200">That link didn&apos;t work. Request a new one.</p>}
      <LoginForm next={next ?? "/"} />
    </main>
  );
}
