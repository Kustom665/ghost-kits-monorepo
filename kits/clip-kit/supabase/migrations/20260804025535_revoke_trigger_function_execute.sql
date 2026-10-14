-- Trigger functions must not be callable through PostgREST RPC.
revoke execute on function public.handle_new_user(), public.touch_updated_at() from anon, authenticated, public;
