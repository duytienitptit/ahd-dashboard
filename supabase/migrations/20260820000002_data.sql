-- 0002_data — the time series. This is the backbone of the product: the dashboard must be useful
-- from these tables alone, with no KPI defined.
-- Reference: docs/DATABASE_ERD.md, docs/DATA_SOURCES.md
--
-- Every `date` column is a CALENDAR DAY IN Asia/Ho_Chi_Minh, not UTC. Studio exports daily totals
-- that cannot be re-zoned; Display API timestamps are converted to VN time before taking the date.
-- Only timestamptz columns (created_at, posted_at, ...) hold UTC.

-- Metric columns are deliberately nullable: no source provides all of them. profile_views and the
-- viewer counts only ever come from studio_import. The import layer must never overwrite a real
-- number with null.
create table public.data_snapshot (
  id                 uuid primary key default gen_random_uuid(),
  channel_id         uuid not null references public.channel (id) on delete cascade,
  date               date not null,
  source             text not null check (source in ('studio_import', 'business_api', 'display_api', 'vendor_scraping', 'manual_entry')),
  video_views        bigint,
  profile_views      bigint,
  likes              bigint,
  comments           bigint,
  shares             bigint,
  followers          bigint,
  video_count        integer,
  total_viewers      bigint,
  new_viewers        bigint,
  returning_viewers  bigint,
  is_complete        boolean not null default true,
  raw_file_ref       text,
  created_at         timestamptz not null default now(),
  constraint data_snapshot_channel_date_source_key unique (channel_id, date, source)
);

comment on column public.data_snapshot.video_views is 'Views generated ON this day, not lifetime total. Derived per-video from Display API deltas.';
comment on column public.data_snapshot.followers is 'Absolute follower count at end of day, not the daily gain. KPI progress uses this as a milestone.';
comment on column public.data_snapshot.is_complete is 'false = the source returned a truncated list (rate limit). Must not be used to compute KPI.';
comment on column public.data_snapshot.raw_file_ref is 'Storage path of the original Studio zip. null for every source except studio_import.';

-- Deliberately absent: followers_diff (the CSV column of that name is off by one day — compute it
-- from the followers series instead), engagement_rate and views_per_video (derived, never stored).

create index data_snapshot_channel_date_idx on public.data_snapshot (channel_id, date desc);

create table public.content_video (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid not null references public.channel (id) on delete cascade,
  tiktok_video_id text not null unique,
  video_link      text not null unique,
  title           text,
  hashtags        text[] not null default '{}',
  posted_at       timestamptz,
  first_seen_at   timestamptz not null default now(),
  last_synced_at  timestamptz
);

comment on table public.content_video is 'One row per published video. Counting rows with posted_at inside a period is how videosInPeriod is measured — never the difference of video_count, which a deleted video would skew.';

create index content_video_channel_posted_idx on public.content_video (channel_id, posted_at desc);

create table public.video_snapshot (
  id               uuid primary key default gen_random_uuid(),
  content_video_id uuid not null references public.content_video (id) on delete cascade,
  date             date not null,
  view_count       bigint,
  like_count       bigint,
  comment_count    bigint,
  share_count      bigint,
  constraint video_snapshot_video_date_key unique (content_video_id, date)
);

comment on column public.video_snapshot.view_count is 'LIFETIME cumulative views of the video, not views on that day. Daily views are the per-video delta between two dates.';

create index video_snapshot_video_date_idx on public.video_snapshot (content_video_id, date desc);

create table public.follower_activity (
  id               uuid primary key default gen_random_uuid(),
  channel_id       uuid not null references public.channel (id) on delete cascade,
  date             date not null,
  hour             smallint not null check (hour between 0 and 23),
  active_followers integer,
  constraint follower_activity_channel_date_hour_key unique (channel_id, date, hour)
);

comment on table public.follower_activity is 'Hourly follower activity from FollowerActivity.csv. Only 7 days per export — a skipped weekly import loses that week permanently.';

create table public.audience_snapshot (
  id                      uuid primary key default gen_random_uuid(),
  channel_id              uuid not null references public.channel (id) on delete cascade,
  captured_on             date not null,
  gender_distribution     jsonb,
  territory_distribution  jsonb,
  -- Not in the ERD: makes re-running an import on the same day idempotent instead of duplicating.
  constraint audience_snapshot_channel_date_key unique (channel_id, captured_on)
);
