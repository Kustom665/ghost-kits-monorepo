-- Clip Kit core schema: profiles (plan state), videos (pipeline state), clips (outputs).

create type public.video_status as enum (
  'UPLOADING', 'UPLOADED', 'EXTRACTING_AUDIO', 'TRANSCRIBING',
  'SELECTING_CLIPS', 'RENDERING', 'DONE', 'FAILED'
);
create type public.clip_status as enum ('PENDING', 'RENDERING', 'DONE', 'FAILED');
create type public.plan_tier as enum ('free', 'creator', 'studio');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plan public.plan_tier not null default 'free',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  original_filename text not null,
  storage_path text,
  mime_type text not null,
  duration_sec double precision,
  status public.video_status not null default 'UPLOADING',
  error_message text,
  transcript_text text,
  transcript_words jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index videos_user_id_created_at_idx on public.videos (user_id, created_at desc);
create index videos_status_created_at_idx on public.videos (status, created_at);

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  index integer not null,
  title text not null,
  hook text not null,
  reasoning text not null,
  virality_score integer not null check (virality_score between 0 and 100),
  start_sec double precision not null,
  end_sec double precision not null,
  status public.clip_status not null default 'PENDING',
  error_message text,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_sec > start_sec)
);
create index clips_video_id_index_idx on public.clips (video_id, index);
create index clips_user_id_idx on public.clips (user_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger videos_touch before update on public.videos for each row execute function public.touch_updated_at();
create trigger clips_touch before update on public.clips for each row execute function public.touch_updated_at();

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row level security: users only ever see their own rows. Plan state is written
-- exclusively by the Stripe webhook via the service role.
alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.clips enable row level security;

create policy "profiles: select own" on public.profiles for select to authenticated using ((select auth.uid()) = id);

create policy "videos: select own" on public.videos for select to authenticated using ((select auth.uid()) = user_id);
create policy "videos: insert own" on public.videos for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "videos: update own" on public.videos for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "videos: delete own" on public.videos for delete to authenticated using ((select auth.uid()) = user_id);

create policy "clips: select own" on public.clips for select to authenticated using ((select auth.uid()) = user_id);
create policy "clips: delete own" on public.clips for delete to authenticated using ((select auth.uid()) = user_id);
