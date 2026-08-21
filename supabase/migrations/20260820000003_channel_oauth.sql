-- 0003_channel_oauth — Display API credentials, one connection per channel.
-- Reference: docs/DISPLAY_API.md
--
-- SECURITY: access_token and refresh_token hold CIPHERTEXT produced by lib/crypto/token.ts
-- (AES-256-GCM, key in TOKEN_ENCRYPTION_KEY). Never write a plaintext token into these columns.
-- 0006_rls.sql enables RLS on this table with ZERO policies: no signed-in user can read it at all,
-- only the service-role client (lib/supabase/admin.ts) can.

create table public.channel_oauth (
  id                 uuid primary key default gen_random_uuid(),
  channel_id         uuid not null unique references public.channel (id) on delete cascade,
  tiktok_open_id     text not null,
  access_token       text not null,
  access_expires_at  timestamptz,
  refresh_token      text not null,
  refresh_expires_at timestamptz,
  scopes             text not null default 'user.info.basic,user.info.stats,video.list',
  last_refreshed_at  timestamptz,
  last_sync_at       timestamptz,
  last_sync_status   text check (last_sync_status in ('ok', 'failed', 'rate_limited')),
  last_sync_error    text,
  created_at         timestamptz not null default now()
);

comment on column public.channel_oauth.refresh_token is 'ROTATES. Every refresh call returns a token that must be written back here — reusing the old one loses access and forces a manual re-OAuth.';
comment on column public.channel_oauth.refresh_expires_at is 'Roughly 365 days out. The connections screen warns at least 30 days before this.';
