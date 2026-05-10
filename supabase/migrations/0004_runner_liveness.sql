-- Runner liveness — a runner is "live" only if it has heartbeated recently.
-- The `runners.status` column lies because nothing flips it back to offline
-- when the agent stops heartbeating. We treat "online" as the intent and
-- (status=online AND last_seen_at > now() - 60s) as the truth.

create or replace view public.runners_live as
select
  r.*,
  (r.status = 'online' AND r.last_seen_at > now() - interval '60 seconds') as is_live
from public.runners r;

-- Make the view inherit RLS from the base table (Supabase: RLS is enforced
-- on the underlying table when SELECT permissions go through the API).
grant select on public.runners_live to anon, authenticated, service_role;

-- Sweep stale rows: anything online but stale → offline. Idempotent. Safe to
-- call from a cron or on-demand from a route.
create or replace function public.sweep_stale_runners() returns int as $$
declare
  affected int;
begin
  update public.runners
    set status = 'offline'
    where status = 'online'
      and (last_seen_at is null or last_seen_at < now() - interval '60 seconds');
  get diagnostics affected = row_count;
  return affected;
end;
$$ language plpgsql security definer;

grant execute on function public.sweep_stale_runners() to anon, authenticated, service_role;
