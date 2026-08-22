-- 0011 (2026-08-21) — Team: a label grouping Creators (and, transitively, their channels).
-- Reference: CLAUDE.md, docs/DATABASE_ERD.md
--
-- Deliberately NOT a permission boundary (confirmed with the user 21/08/2026, both answers picked
-- the low-risk option): there is still exactly one Manager tier with full access to everything, and
-- Creators still see all channels' data regardless of team (the existing "cross-channel visibility
-- is a deliberate product decision" in 0006_rls.sql is untouched). Team exists purely so the UI can
-- group/filter — "Tổng quan theo team", "Kênh lọc theo team" — the same shape creatorId filtering
-- already has, one level up.
--
-- `channel` deliberately has NO team_id column of its own — a channel's team is always derived
-- transitively via current_creator_id -> creator.team_id, so there is exactly one place team
-- membership can drift out of sync (the creator's own team_id), not two.

create table public.team (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

alter table public.creator
  add column team_id uuid references public.team (id) on delete set null;

comment on column public.creator.team_id is
  'Optional — a Creator may start unassigned, same as channel.current_creator_id. Determines the '
  'channel(s) they currently own''s team too (derived, not stored again on channel).';

alter table public.team enable row level security;

-- Same shape as every other business table in 0006_rls.sql's loop: anyone signed in reads, only a
-- Manager writes. Added as its own statement (not folded back into that migration) since migrations
-- are immutable once applied.
create policy team_select_authenticated on public.team
  for select to authenticated using (true);

create policy team_write_manager on public.team
  for all to authenticated using (public.is_manager()) with check (public.is_manager());
