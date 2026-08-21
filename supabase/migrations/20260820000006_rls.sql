-- 0006_rls — row level security. This is where access is actually enforced; checks in route
-- handlers are a second layer, not the first.
-- Reference: docs/USER_FLOW.md "Khác biệt theo vai trò"
--
-- Manager: full access. Creator: read-only across the whole team (cross-channel visibility is a
-- deliberate product decision), and no access to tokens or the audit trail.
-- The service-role client bypasses RLS entirely — it is used only by the cron sync, the OAuth
-- token store, and Auth admin calls.

alter table public.manager                   enable row level security;
alter table public.creator                   enable row level security;
alter table public.channel                   enable row level security;
alter table public.channel_ownership_history enable row level security;
alter table public.data_snapshot             enable row level security;
alter table public.content_video             enable row level security;
alter table public.video_snapshot            enable row level security;
alter table public.follower_activity         enable row level security;
alter table public.audience_snapshot         enable row level security;
alter table public.kpi_cycle                 enable row level security;
alter table public.channel_oauth             enable row level security;
alter table public.audit_log                 enable row level security;

-- Manager rows are readable (the UI shows who assigned what) but only the service role writes them.
create policy manager_select_authenticated on public.manager
  for select to authenticated using (true);

-- Identical rules on every business table: anyone signed in reads, only a Manager writes.
-- Kept as a loop so the uniformity is verifiable at a glance.
do $$
declare
  t text;
begin
  foreach t in array array[
    'creator', 'channel', 'channel_ownership_history', 'data_snapshot',
    'content_video', 'video_snapshot', 'follower_activity', 'audience_snapshot', 'kpi_cycle'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select_authenticated', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_manager()) with check (public.is_manager())',
      t || '_write_manager', t);
  end loop;
end;
$$;

-- channel_oauth: RLS on, zero policies. No anon or authenticated role can read or write it under
-- any circumstance; the service role is the only way in.

-- audit_log: Manager reads and appends. No update or delete policy exists, and none may be added —
-- these entries exist to settle disputes about bonus numbers.
create policy audit_log_select_manager on public.audit_log
  for select to authenticated using (public.is_manager());

create policy audit_log_insert_manager on public.audit_log
  for insert to authenticated with check (public.is_manager());
