export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const SUPABASE_URL = () => required("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_PUBLISHABLE_KEY = () => required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
export const SUPABASE_SERVICE_ROLE_KEY = () => required("SUPABASE_SERVICE_ROLE_KEY");

export const VIDEOS_BUCKET = "videos";
export const CLIPS_BUCKET = "clips";
