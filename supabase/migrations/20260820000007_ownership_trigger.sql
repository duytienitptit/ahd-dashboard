-- 0007_ownership_trigger — keep channel_ownership_history in sync with channel.current_creator_id
-- automatically, so no caller (route handler, seed script, cron, future M3-M6 code) can update the
-- pointer column and forget to record the handoff.
-- Reference: docs/DATABASE_ERD.md "channel_ownership_history"

-- `date` columns are Asia/Ho_Chi_Minh calendar days (see the ERD's timezone table at the top);
-- every place that needs "today" for one of them must go through this, not `current_date` (server
-- clock / session timezone, not guaranteed to be VN).
create function public.today_vn() returns date
  language sql
  stable
as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date;
$$;

-- `to_date` is a half-open bound: `[from_date, to_date)`. `to_date` is the first day the Creator no
-- longer owns the channel, so a handoff day belongs to exactly one Creator, never both and never
-- neither.
comment on column public.channel_ownership_history.to_date is 'Half-open: the first day the Creator no longer owns the channel. null = currently assigned.';

create function public.sync_channel_ownership() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  open_row public.channel_ownership_history;
  today date := public.today_vn();
begin
  -- Lock any existing open row for this channel first, so two concurrent reassignments cannot both
  -- read "no open row" and both try to insert one (the partial unique index would reject the loser
  -- with a generic conflict instead of the clean handling below).
  select * into open_row
    from public.channel_ownership_history
   where channel_id = new.id and to_date is null
   for update;

  if open_row.id is not null and open_row.from_date = today then
    -- Opened earlier today (by this same trigger, on an earlier statement in the same day) and
    -- corrected again before the day rolled over — e.g. assigned to the wrong Creator and fixed
    -- minutes later. Editing in place avoids a zero-length row; closing-and-reopening here would
    -- create one (to_date = from_date).
    if new.current_creator_id is null then
      delete from public.channel_ownership_history where id = open_row.id;
    else
      update public.channel_ownership_history
         set creator_id = new.current_creator_id
       where id = open_row.id;
    end if;
    return new;
  end if;

  if open_row.id is not null then
    update public.channel_ownership_history set to_date = today where id = open_row.id;
  end if;

  if new.current_creator_id is not null then
    insert into public.channel_ownership_history (channel_id, creator_id, from_date)
    values (new.id, new.current_creator_id, today);
  end if;

  return new;
end;
$$;

comment on function public.sync_channel_ownership is 'Backs channel.current_creator_id with channel_ownership_history. Do not write channel_ownership_history directly outside this function — it will fight the trigger.';

-- Two triggers, not one combined `after insert or update`: a WHEN clause comparing to OLD is not
-- valid on an event that also fires for INSERT, where OLD does not exist.
create trigger channel_ownership_sync_insert
  after insert on public.channel
  for each row
  execute function public.sync_channel_ownership();

create trigger channel_ownership_sync_update
  after update of current_creator_id on public.channel
  for each row
  when (new.current_creator_id is distinct from old.current_creator_id)
  execute function public.sync_channel_ownership();

-- Backfill: any channel that already has a Creator assigned but no open ownership row (there
-- shouldn't be one after this migration, since M1 seeded only unassigned channels — this guards
-- against that assumption changing before the migration runs).
insert into public.channel_ownership_history (channel_id, creator_id, from_date)
select id, current_creator_id, public.today_vn()
  from public.channel c
 where c.current_creator_id is not null
   and not exists (
     select 1 from public.channel_ownership_history h
      where h.channel_id = c.id and h.to_date is null
   );

-- "Latest data_snapshot row per channel" — GET /api/channels needs one summary row per channel;
-- without this it would have to pull the whole v_channel_daily series per channel and pick the max
-- date in application code. security_invoker for the same reason as v_channel_daily (0005): a
-- default view runs with the owner's rights and would leak rows past RLS.
create view public.v_channel_latest with (security_invoker = on) as
  select distinct on (channel_id) *
  from public.v_channel_daily
  order by channel_id, date desc;

comment on view public.v_channel_latest is 'One row per channel: its most recent v_channel_daily entry. null for a channel with no data_snapshot rows yet.';

grant select on public.v_channel_latest to authenticated;
