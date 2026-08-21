-- Recreates just enough of a Supabase database for the migrations to run on a plain Postgres
-- container: the auth schema, the built-in roles, auth.uid(), and (from M3a on) the storage schema.
-- Used only by scripts/dryrun/run.sh. Never applied to a real project — on the real Supabase project
-- these schemas already exist as part of the platform, which is why no migration ever creates them.

create schema if not exists auth;

create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Same implementation Supabase uses: the subject claim of the request's JWT.
create function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants these to every new object in `public` via default privileges, applied at CREATE
-- time. Emulating it the same way matters: 0004 revokes update/delete on audit_log right after
-- creating it, and a blanket GRANT run after the migrations would silently hand them back.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant all on tables to service_role;

-- Minimal stand-in for Supabase Storage — just enough of buckets/objects for 0008's bucket insert
-- and RLS policy to run. Not a faithful copy of the real schema (no metadata, owner, etc.).
create schema if not exists storage;

create table storage.buckets (
  id         text primary key,
  name       text not null,
  public     boolean not null default false,
  created_at timestamptz not null default now()
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- Real Supabase grants table-level access on storage.* to anon/authenticated by default (RLS
-- policies do the actual restricting) — mirror that here or every policy check below would fail
-- with a bare "permission denied for schema storage" before RLS even gets evaluated.
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.buckets, storage.objects to anon, authenticated;
grant all on storage.buckets, storage.objects to service_role;
