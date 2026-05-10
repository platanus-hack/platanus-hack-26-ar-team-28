-- The dashboard can request a sweep through authenticated server code, and
-- runner heartbeats execute it through service-role routes. Anonymous callers
-- should not be able to invoke this state-changing maintenance function.
revoke execute on function public.sweep_stale_runners() from public;
revoke execute on function public.sweep_stale_runners() from anon;
grant execute on function public.sweep_stale_runners() to authenticated, service_role;
