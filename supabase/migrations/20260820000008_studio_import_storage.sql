-- 0008_studio_import_storage — Storage bucket for the original Studio export zips.
-- Reference: docs/CSV_FORMAT.md, docs/DATABASE_ERD.md "Bảo mật token" (same Manager-only pattern)
--
-- `storage.buckets`/`storage.objects` already exist on the real Supabase project as part of the
-- platform — this migration only registers a bucket and adds an RLS policy, same as every other
-- migration never creates `auth.*`. scripts/dryrun/00_bootstrap.sql stubs a minimal version of both
-- tables so this migration can still be dry-run tested locally.

insert into storage.buckets (id, name, public)
values ('studio-imports', 'studio-imports', false)
on conflict (id) do nothing;

-- Same access rule as channel_oauth/audit_log: only a Manager touches this, and RLS is the real
-- enforcement layer, not a check in the route handler.
create policy studio_imports_manager_all on storage.objects
  for all to authenticated
  using (bucket_id = 'studio-imports' and public.is_manager())
  with check (bucket_id = 'studio-imports' and public.is_manager());

comment on column public.data_snapshot.raw_file_ref is 'Storage path of the import BATCH this row came from (studio-imports/<channelId>/<batchId>), not a single file — one date''s row is merged from up to 3 separate zips (Overview/Followers/Viewers), so there is no single file to point at. null for every source except studio_import.';
