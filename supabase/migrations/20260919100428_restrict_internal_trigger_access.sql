-- This event-trigger helper is installed by Supabase to enable RLS on tables.
-- It is an internal DDL hook, not a callable client API.
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
