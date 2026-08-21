-- 0001_identity — people and channels.
-- Reference: docs/DATABASE_ERD.md
--
-- Identity linkage: manager.id / creator.id ARE the auth.users id (not a separate uuid joined by
-- email). RLS policies compare auth.uid() directly; changing a user's email never breaks the link.

create table public.manager (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  email      text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.manager is 'Manager accounts. id = auth.users.id. Rows are created by the seed script / admin API only.';

create table public.creator (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  email      text not null unique,
  manager_id uuid references public.manager (id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.creator is 'Creator accounts. id = auth.users.id. Created by a Manager — there is no self-signup.';

create index creator_manager_id_idx on public.creator (manager_id);

create table public.channel (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  tiktok_handle      text not null unique,
  current_creator_id uuid references public.creator (id) on delete set null,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

comment on column public.channel.current_creator_id is 'Nullable: a channel may exist before it is assigned to a Creator.';

create index channel_current_creator_id_idx on public.channel (current_creator_id);

create table public.channel_ownership_history (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channel (id) on delete cascade,
  creator_id uuid not null references public.creator (id) on delete cascade,
  from_date  date not null,
  to_date    date,
  constraint channel_ownership_history_date_order check (to_date is null or to_date >= from_date)
);

comment on column public.channel_ownership_history.to_date is 'null = currently assigned.';

-- At most one open ownership row per channel.
create unique index channel_ownership_history_one_open_idx
  on public.channel_ownership_history (channel_id)
  where to_date is null;

create index channel_ownership_history_channel_idx
  on public.channel_ownership_history (channel_id, from_date desc);

-- Role helper used by every RLS policy below. security definer so a policy on `manager` itself
-- cannot recurse into this lookup.
create function public.is_manager() returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (select 1 from public.manager where id = auth.uid());
$$;

revoke execute on function public.is_manager() from public;
grant execute on function public.is_manager() to authenticated;
