-- 2026-08-27 — Stop archiving the original Studio zips.
--
-- Decision (user, 27/08/2026): the import only needs the parsed numbers — keeping a copy of every
-- uploaded zip in Storage added no real value. It also let the Creator-upload path stay blocked by a
-- Supabase Storage + asymmetric-JWT (ES256) bug that has nothing to do with our SQL: PostgREST
-- verifies the ES256 user token and resolves auth.uid() fine, but this project's Storage service does
-- not, so its RLS check saw auth.uid() as NULL and rejected every Creator upload. Dropping the
-- archive step sidesteps that entirely. Data import itself never depended on the file being stored.
--
-- `raw_file_ref` stays but now holds ONLY the import batch id (a uuid), not a Storage path: every
-- data_snapshot row from one upload shares it, so a Manager can trace a number back to the run that
-- wrote it. Nothing reads it to fetch a file (nothing ever did outside that dead upload step).
--
-- The `studio-imports` bucket and its RLS policies (migrations 0008, 0012) are LEFT IN PLACE, inert.
-- Nothing writes to them now. Not dropped here on purpose — zero risk to leave, and they are the
-- whole scaffold if file archiving is ever wanted back (or once Supabase fixes Storage's ES256
-- handling). See lib/import/run-import.ts and docs/DATABASE_ERD.md "Storage: bucket studio-imports".

comment on column public.data_snapshot.raw_file_ref is
  'Import batch id (uuid). Every data_snapshot row written by one Studio import upload shares it, so a Manager can trace a number back to the upload that produced it. NOT a file path — uploaded zips are parsed then discarded, nothing is stored. null for every source except studio_import.';
