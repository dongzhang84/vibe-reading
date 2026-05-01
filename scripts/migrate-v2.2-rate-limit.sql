-- ═══════════════════════════════════════════════════════════════════════════
-- Vibe Reading v2.1 → v2.2 — Per-user daily rate-limit infrastructure
-- Run this in Supabase Dashboard → SQL Editor → Cmd/Ctrl+Enter
-- Idempotent: safe to run twice (uses IF NOT EXISTS / OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════════

-- One row per (user, action, calendar day) carrying a counter. Old rows can
-- be cleaned up by a periodic job later — they're tiny so it's not urgent.
create table if not exists vr.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  action  text not null,
  day     date not null default current_date,
  count   integer not null default 0,
  primary key (user_id, action, day)
);

alter table vr.usage_counters enable row level security;
-- No public policies — service_role only. Users never query this directly.

create index if not exists idx_usage_counters_day
  on vr.usage_counters (day);

-- Atomic increment-with-cap-check. The `for update` row lock prevents two
-- concurrent requests from both passing the cap check (which would happen
-- with a naive read-then-upsert). Returns the post-increment state so the
-- caller can include `used / cap` in the rate-limit response.
create or replace function vr.bump_usage(
  p_user_id uuid,
  p_action  text,
  p_cap     int
) returns table (allowed boolean, used int, cap int)
language plpgsql
security definer
set search_path = vr, public
as $$
declare
  cur_count int;
begin
  insert into vr.usage_counters (user_id, action, day, count)
  values (p_user_id, p_action, current_date, 0)
  on conflict (user_id, action, day) do nothing;

  select c.count into cur_count
  from vr.usage_counters c
  where c.user_id = p_user_id
    and c.action  = p_action
    and c.day     = current_date
  for update;

  if cur_count >= p_cap then
    return query select false, cur_count, p_cap;
    return;
  end if;

  update vr.usage_counters
  set count = count + 1
  where user_id = p_user_id
    and action  = p_action
    and day     = current_date;

  return query select true, cur_count + 1, p_cap;
end;
$$;

grant execute on function vr.bump_usage(uuid, text, int) to service_role;

-- After running, regenerate TypeScript types (optional but recommended):
--   npm run db:types
