-- 0004_kpi_audit — KPI cycles and the append-only audit trail.
-- Reference: docs/PRODUCT_SPEC.md, docs/API_SPEC.md

-- Needed to mix an equality column with a range in one exclusion constraint.
create extension if not exists btree_gist;

create table public.kpi_cycle (
  id                 uuid primary key default gen_random_uuid(),
  channel_id         uuid not null references public.channel (id) on delete cascade,
  period_type        text not null check (period_type in ('weekly', 'custom')),
  period_start       date not null,
  period_end         date not null,
  target_views       bigint,
  target_videos      integer,
  target_followers   bigint,
  followers_at_start bigint not null,
  status             text not null default 'draft' check (status in ('draft', 'final')),
  finalized_by       uuid references public.manager (id) on delete set null,
  finalized_at       timestamptz,
  created_at         timestamptz not null default now(),
  constraint kpi_cycle_period_order check (period_end >= period_start),
  -- Two cycles on one channel may not overlap. Raises 23P01, which POST /api/kpi-cycles turns into
  -- a 409 rather than re-checking in application code.
  constraint kpi_cycle_no_overlap exclude using gist (
    channel_id with =,
    daterange(period_start, period_end, '[]') with &&
  )
);

comment on column public.kpi_cycle.followers_at_start is 'Captured once when the cycle is created, never edited. Required, so a cycle cannot be created and back-filled later.';
comment on column public.kpi_cycle.target_followers is 'An absolute milestone (reach 10,000 followers), not a gain. Progress = (current - at_start) / (target - at_start).';
comment on column public.kpi_cycle.status is 'final locks the numbers — they feed bonus calculations. Any later change must be written to audit_log.';

create index kpi_cycle_channel_period_idx on public.kpi_cycle (channel_id, period_start desc);

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id   uuid,
  action      text not null,
  actor       text not null,
  note        text,
  created_at  timestamptz not null default now()
);

comment on table public.audit_log is 'Append-only. 0006_rls.sql grants insert and select but never update or delete.';
comment on column public.audit_log.actor is 'Email of the acting user, captured at write time so the entry survives account deletion.';

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);

revoke update, delete on public.audit_log from anon, authenticated;
