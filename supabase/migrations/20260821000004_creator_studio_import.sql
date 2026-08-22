-- 0012 (2026-08-21) — let a Creator upload the Studio export for the channel they currently own.
-- Reference: CLAUDE.md, docs/USER_FLOW.md, docs/PRODUCT_SPEC.md mục 2
--
-- Decision (confirmed with the user 21/08/2026): actual operating practice already has Creators
-- exporting and uploading the weekly Studio zip — docs/USER_FLOW.md previously said Creator has no
-- "Dữ liệu" tab at all, which no longer matches reality. This migration is the DB-level half of
-- closing that gap; the route/UI half is separate.
--
-- Deliberately narrow, NOT a blanket relaxation of 0006_rls.sql's "Manager writes everything" rule:
--   1. Scoped to channels the calling Creator currently owns (current_creator_id = auth.uid()) —
--      never someone else's channel.
--   2. `data_snapshot` gets its OWN extra check: source = 'studio_import' ONLY. This table is the one
--      place with a second legitimate write path (manual_entry, app/api/channels/[id]/manual-entry) —
--      CLAUDE.md is explicit that manual_entry must stay Manager-only ("người hưởng thưởng không tự
--      khai số tính thưởng"). Without this extra clause, relaxing data_snapshot for Creator would
--      also silently let them insert a manual_entry row directly via the client SDK, bypassing that
--      route's requireManager() entirely — RLS is the real enforcement layer here (0006_rls.sql's own
--      stated philosophy), so the route check alone would not have been enough.
--   3. INSERT + UPDATE only, never DELETE — a Creator can add/overwrite their own import's rows
--      (upsert, same as re-running an import), but cannot remove historical data. content_video and
--      data_snapshot feed KPI/bonus math (`videosTrongKỳ`, progress) — deletion capability stays
--      Manager-only even for the Creator's own channel.
--   4. Storage: same channel-ownership check, matched against the object path's first folder segment
--      (`<channelId>/<batchId>/<file>` — see run-import.ts's `storagePrefix`).

create policy data_snapshot_creator_studio_import_insert on public.data_snapshot
  for insert to authenticated
  with check (
    source = 'studio_import'
    and exists (select 1 from public.channel where id = channel_id and current_creator_id = auth.uid())
  );

create policy data_snapshot_creator_studio_import_update on public.data_snapshot
  for update to authenticated
  using (
    source = 'studio_import'
    and exists (select 1 from public.channel where id = channel_id and current_creator_id = auth.uid())
  )
  with check (
    source = 'studio_import'
    and exists (select 1 from public.channel where id = channel_id and current_creator_id = auth.uid())
  );

create policy content_video_creator_own_channel_insert on public.content_video
  for insert to authenticated
  with check (exists (select 1 from public.channel where id = channel_id and current_creator_id = auth.uid()));

create policy content_video_creator_own_channel_update on public.content_video
  for update to authenticated
  using (exists (select 1 from public.channel where id = channel_id and current_creator_id = auth.uid()))
  with check (exists (select 1 from public.channel where id = channel_id and current_creator_id = auth.uid()));

create policy video_snapshot_creator_own_channel_insert on public.video_snapshot
  for insert to authenticated
  with check (
    exists (
      select 1 from public.content_video cv
      join public.channel ch on ch.id = cv.channel_id
      where cv.id = content_video_id and ch.current_creator_id = auth.uid()
    )
  );

create policy video_snapshot_creator_own_channel_update on public.video_snapshot
  for update to authenticated
  using (
    exists (
      select 1 from public.content_video cv
      join public.channel ch on ch.id = cv.channel_id
      where cv.id = content_video_id and ch.current_creator_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.content_video cv
      join public.channel ch on ch.id = cv.channel_id
      where cv.id = content_video_id and ch.current_creator_id = auth.uid()
    )
  );

create policy follower_activity_creator_own_channel_insert on public.follower_activity
  for insert to authenticated
  with check (exists (select 1 from public.channel where id = channel_id and current_creator_id = auth.uid()));

create policy follower_activity_creator_own_channel_update on public.follower_activity
  for update to authenticated
  using (exists (select 1 from public.channel where id = channel_id and current_creator_id = auth.uid()))
  with check (exists (select 1 from public.channel where id = channel_id and current_creator_id = auth.uid()));

create policy audience_snapshot_creator_own_channel_insert on public.audience_snapshot
  for insert to authenticated
  with check (exists (select 1 from public.channel where id = channel_id and current_creator_id = auth.uid()));

create policy audience_snapshot_creator_own_channel_update on public.audience_snapshot
  for update to authenticated
  using (exists (select 1 from public.channel where id = channel_id and current_creator_id = auth.uid()))
  with check (exists (select 1 from public.channel where id = channel_id and current_creator_id = auth.uid()));

create policy studio_imports_creator_own_channel_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'studio-imports'
    and exists (
      select 1 from public.channel
      where id = ((storage.foldername(name))[1])::uuid and current_creator_id = auth.uid()
    )
  );

create policy studio_imports_creator_own_channel_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'studio-imports'
    and exists (
      select 1 from public.channel
      where id = ((storage.foldername(name))[1])::uuid and current_creator_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'studio-imports'
    and exists (
      select 1 from public.channel
      where id = ((storage.foldername(name))[1])::uuid and current_creator_id = auth.uid()
    )
  );
