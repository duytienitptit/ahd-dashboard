-- Schema assertions. Run by scripts/dryrun/run.sh after the migrations; any failure raises and
-- psql -v ON_ERROR_STOP=1 exits non-zero.
\set ON_ERROR_STOP on

\set mgr '11111111-1111-1111-1111-111111111111'
\set crt '22222222-2222-2222-2222-222222222222'
\set ch  '33333333-3333-3333-3333-333333333333'

insert into auth.users (id, email) values (:'mgr', 'mgr@test.local'), (:'crt', 'crt@test.local');
insert into public.manager (id, name, email) values (:'mgr', 'Quản lý', 'mgr@test.local');
insert into public.creator (id, name, email, manager_id) values (:'crt', 'Bạn Creator', 'crt@test.local', :'mgr');
insert into public.channel (id, name, tiktok_handle, current_creator_id) values (:'ch', 'Kênh thử', '@kenh_thu', :'crt');
insert into public.channel_oauth (channel_id, tiktok_open_id, access_token, refresh_token)
  values (:'ch', 'open-id', 'v1:cipher', 'v1:cipher');

-- The same day arriving from three sources, deliberately out of priority order.
insert into public.data_snapshot (channel_id, date, source, video_views) values
  (:'ch', '2026-08-01', 'display_api',   100),
  (:'ch', '2026-08-01', 'manual_entry',  999),
  (:'ch', '2026-08-01', 'studio_import', 150);

\echo '— resolver picks the highest-priority source'
do $$
declare
  rows int;
  picked text;
begin
  select count(*) into rows from public.v_channel_daily where date = '2026-08-01';
  if rows <> 1 then raise exception 'v_channel_daily returned % rows for one day, expected 1', rows; end if;

  select source into picked from public.v_channel_daily where date = '2026-08-01';
  if picked <> 'studio_import' then raise exception 'expected studio_import, got %', picked; end if;
end;
$$;

\echo '— removing studio_import falls back to display_api, not manual_entry'
delete from public.data_snapshot where date = '2026-08-01' and source = 'studio_import';
do $$
declare picked text;
begin
  select source into picked from public.v_channel_daily where date = '2026-08-01';
  if picked <> 'display_api' then raise exception 'expected display_api, got %', picked; end if;
end;
$$;

\echo '— one channel+day+source may only exist once'
do $$
begin
  insert into public.data_snapshot (channel_id, date, source, video_views)
    values ('33333333-3333-3333-3333-333333333333', '2026-08-01', 'display_api', 123);
  raise exception 'duplicate (channel, date, source) was accepted';
exception when unique_violation then null;
end;
$$;

\echo '— overlapping KPI cycles on one channel are rejected'
insert into public.kpi_cycle (channel_id, period_type, period_start, period_end, followers_at_start)
  values (:'ch', 'weekly', '2026-08-17', '2026-08-23', 1000);
do $$
begin
  insert into public.kpi_cycle (channel_id, period_type, period_start, period_end, followers_at_start)
    values ('33333333-3333-3333-3333-333333333333', 'custom', '2026-08-20', '2026-08-26', 1000);
  raise exception 'overlapping kpi_cycle was accepted';
exception when exclusion_violation then null;
end;
$$;

\echo '— creating a channel with a creator auto-opens one ownership row (0007 trigger)'
do $$
declare
  n int;
  opened_from date;
begin
  select count(*) into n from public.channel_ownership_history where channel_id = '33333333-3333-3333-3333-333333333333' and to_date is null;
  if n <> 1 then raise exception 'expected exactly 1 open ownership row after channel insert, got %', n; end if;

  select from_date into opened_from from public.channel_ownership_history where channel_id = '33333333-3333-3333-3333-333333333333' and to_date is null;
  if opened_from <> public.today_vn() then raise exception 'auto-opened row has from_date %, expected today', opened_from; end if;
end;
$$;

\echo '— a channel may have only one open ownership row'
do $$
begin
  insert into public.channel_ownership_history (channel_id, creator_id, from_date)
    values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '2020-01-01');
  raise exception 'a second open ownership row was accepted';
exception when unique_violation then null;
end;
$$;

\set crt2 '44444444-4444-4444-4444-444444444444'
insert into auth.users (id, email) values (:'crt2', 'crt2@test.local');
insert into public.creator (id, name, email, manager_id) values (:'crt2', 'Creator hai', 'crt2@test.local', :'mgr');

-- Backdate the auto-opened row so the reassignment below takes the close-and-reopen path. The
-- same-day-edit-in-place path is a distinct behaviour, tested separately right after.
update public.channel_ownership_history set from_date = '2020-01-01'
 where channel_id = :'ch' and to_date is null;

\echo '— reassigning a channel closes the old open row (to_date = today) and opens a new one'
update public.channel set current_creator_id = :'crt2' where id = :'ch';
do $$
declare
  closed_today int;
  open_creator uuid;
begin
  select count(*) into closed_today from public.channel_ownership_history
   where channel_id = '33333333-3333-3333-3333-333333333333' and to_date = public.today_vn();
  if closed_today <> 1 then raise exception 'expected 1 row closed today, got %', closed_today; end if;

  select creator_id into open_creator from public.channel_ownership_history
   where channel_id = '33333333-3333-3333-3333-333333333333' and to_date is null;
  if open_creator is distinct from '44444444-4444-4444-4444-444444444444'::uuid then
    raise exception 'open row belongs to %, expected the new creator', open_creator;
  end if;
end;
$$;

\echo '— reassigning again the same day edits the open row in place, no zero-length row'
update public.channel set current_creator_id = :'crt' where id = :'ch';
do $$
declare
  total_rows int;
  open_creator uuid;
begin
  select count(*) into total_rows from public.channel_ownership_history where channel_id = '33333333-3333-3333-3333-333333333333';
  if total_rows <> 2 then raise exception 'same-day reassignment changed row count to %, expected 2', total_rows; end if;

  select creator_id into open_creator from public.channel_ownership_history
   where channel_id = '33333333-3333-3333-3333-333333333333' and to_date is null;
  if open_creator is distinct from '22222222-2222-2222-2222-222222222222'::uuid then
    raise exception 'open row belongs to %, expected the original creator back', open_creator;
  end if;
end;
$$;

\echo '— unassigning the same day it was (re)opened deletes the row, no zero-length span'
update public.channel set current_creator_id = null where id = :'ch';
do $$
declare
  total_rows int;
  open_rows int;
begin
  select count(*) into open_rows from public.channel_ownership_history
   where channel_id = '33333333-3333-3333-3333-333333333333' and to_date is null;
  if open_rows <> 0 then raise exception 'expected no open row after unassigning, got %', open_rows; end if;

  select count(*) into total_rows from public.channel_ownership_history where channel_id = '33333333-3333-3333-3333-333333333333';
  if total_rows <> 1 then raise exception 'expected the same-day row deleted, got % total rows', total_rows; end if;
end;
$$;

-- Restore an assignment so downstream sections see the channel owned, matching the rest of this file.
update public.channel set current_creator_id = :'crt' where id = :'ch';

\echo '— channel_oauth has RLS on and no policies at all'
do $$
declare
  policies int;
  rls_on boolean;
begin
  select relrowsecurity into rls_on from pg_class where oid = 'public.channel_oauth'::regclass;
  if not rls_on then raise exception 'RLS is off on channel_oauth'; end if;

  select count(*) into policies from pg_policies where schemaname = 'public' and tablename = 'channel_oauth';
  if policies <> 0 then raise exception 'channel_oauth has % policies, expected none', policies; end if;
end;
$$;

\echo '— audit_log can never be updated or deleted'
do $$
declare policies int;
begin
  select count(*) into policies from pg_policies
   where schemaname = 'public' and tablename = 'audit_log' and cmd in ('UPDATE', 'DELETE');
  if policies <> 0 then raise exception 'audit_log has % update/delete policies', policies; end if;

  if has_table_privilege('authenticated', 'public.audit_log', 'UPDATE')
     or has_table_privilege('authenticated', 'public.audit_log', 'DELETE') then
    raise exception 'authenticated still holds update/delete on audit_log';
  end if;
end;
$$;

\echo '— studio-imports bucket registered, storage.objects RLS on with exactly 1 policy'
do $$
declare
  bucket_count int;
  rls_on boolean;
  policies int;
begin
  select count(*) into bucket_count from storage.buckets where id = 'studio-imports';
  if bucket_count <> 1 then raise exception 'expected the studio-imports bucket to exist, found %', bucket_count; end if;

  select relrowsecurity into rls_on from pg_class where oid = 'storage.objects'::regclass;
  if not rls_on then raise exception 'RLS is off on storage.objects'; end if;

  select count(*) into policies from pg_policies where schemaname = 'storage' and tablename = 'objects';
  if policies <> 1 then raise exception 'storage.objects has % policies, expected 1', policies; end if;
end;
$$;

-- ── Behaviour as a signed-in Creator ────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

\echo '— creator reads channels, writes nothing, sees no tokens or audit trail'
do $$
declare n int;
begin
  if public.is_manager() then raise exception 'creator was resolved as a manager'; end if;

  if (select count(*) from public.channel) = 0 then raise exception 'creator cannot read channel'; end if;
  if (select count(*) from public.v_channel_daily) = 0 then raise exception 'creator cannot read v_channel_daily'; end if;

  update public.channel set name = 'đổi trộm';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'creator updated % channel rows', n; end if;

  if (select count(*) from public.channel_oauth) <> 0 then raise exception 'creator can read channel_oauth'; end if;
  if (select count(*) from public.audit_log) <> 0 then raise exception 'creator can read audit_log'; end if;

  begin
    insert into public.data_snapshot (channel_id, date, source, video_views)
      values ('33333333-3333-3333-3333-333333333333', '2026-08-02', 'manual_entry', 1);
    raise exception 'creator inserted a data_snapshot';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('studio-imports', 'creator-tried.zip');
    raise exception 'creator wrote to the studio-imports bucket';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

-- ── Behaviour as a signed-in Manager ────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

\echo '— manager writes channel data and reads the audit trail, but still not the tokens'
do $$
declare n int;
begin
  if not public.is_manager() then raise exception 'manager was not resolved as a manager'; end if;

  update public.channel set name = 'Kênh thử đổi tên';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'manager updated % channel rows, expected 1', n; end if;

  insert into public.audit_log (entity_type, entity_id, action, actor)
    values ('channel', '33333333-3333-3333-3333-333333333333', 'rename', 'mgr@test.local');
  if (select count(*) from public.audit_log) <> 1 then raise exception 'manager cannot read back audit_log'; end if;

  if (select count(*) from public.channel_oauth) <> 0 then raise exception 'manager can read channel_oauth'; end if;

  insert into storage.objects (bucket_id, name) values ('studio-imports', 'mgr-wrote.zip');
  if (select count(*) from storage.objects where bucket_id = 'studio-imports') <> 1 then
    raise exception 'manager could not write to the studio-imports bucket';
  end if;
end;
$$;
rollback;

\echo 'Tất cả assertion đã pass.'
