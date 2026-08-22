-- 0009 (2026-08-21) — account_verified on channel_oauth.
-- Reference: docs/DISPLAY_API.md, CLAUDE.md (sự cố sai tài khoản 21/08/2026)
--
-- Incident: both connected channels ended up with the SAME wrong TikTok account's token (share_url
-- handle didn't match either channel's tiktok_handle). The mismatch guard in
-- app/api/oauth/callback/route.ts existed but only warned — it never blocked the save. Tightened to
-- block outright; this column carries the one case that still can't be auto-verified: a TikTok
-- account with zero videos has no share_url to check a handle against.

alter table public.channel_oauth
  add column account_verified boolean not null default false;

comment on column public.channel_oauth.account_verified is
  'true once the authorized TikTok account''s handle was confirmed to match channel.tiktok_handle '
  '(via peekFirstVideoLink), or a Manager/Creator manually confirmed it for a zero-video account that '
  'has no share_url to check. lib/tiktok/sync.ts refuses to sync a channel while this is false — an '
  'unverified connection must never be able to write numbers into data_snapshot.';
