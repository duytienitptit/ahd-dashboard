-- 0005_source_resolver — the single place that decides which source wins for a (channel, date).
-- Reference: docs/DATABASE_ERD.md "Chọn nguồn khi 1 ngày có nhiều source"
--
-- One (channel_id, date) can legitimately hold several rows with different sources; they coexist
-- rather than overwriting each other. Every read of channel numbers must go through the view below
-- so two screens can never disagree. The only exception is an explicit ?source= query that asks to
-- see one raw source.

create function public.source_rank(src text) returns integer
  language sql
  immutable
  parallel safe
as $$
  select case src
    when 'studio_import'   then 1  -- reconciled, the only source allowed to close a period
    when 'business_api'    then 2
    when 'display_api'     then 3  -- daily, provisional
    when 'vendor_scraping' then 4
    when 'manual_entry'    then 5  -- unverified, replaced as soon as studio_import lands
    else 99
  end;
$$;

-- security_invoker so the caller's RLS on data_snapshot still applies; a default view would run
-- with the owner's rights and leak rows.
create view public.v_channel_daily with (security_invoker = on) as
  select distinct on (channel_id, date) *
  from public.data_snapshot
  order by channel_id, date, public.source_rank(source);

comment on view public.v_channel_daily is 'One row per (channel, date): the highest-priority source available. Keeps is_complete = false rows — displaying them is fine, but KPI queries must add "where is_complete".';

grant select on public.v_channel_daily to authenticated;
