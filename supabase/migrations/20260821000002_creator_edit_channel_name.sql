-- 0010 (2026-08-21) — let a Creator rename the channel they're currently assigned to.
-- Reference: CLAUDE.md (vấn đề #11, 21/08/2026), docs/USER_FLOW.md
--
-- 0006_rls.sql's rule for `channel` is `for all using (is_manager())` — a Creator has zero write
-- access to the table, by design (RLS is row-level, not column-level, so it can't express "this one
-- column only"). A SECURITY DEFINER function is the standard escape hatch for exactly this shape of
-- rule: it runs with the function owner's privileges, but only after its own body checks the caller
-- is actually the channel's current creator.
--
-- Deliberately NOT extended to tiktok_handle: the OAuth wrong-account guard
-- (app/api/oauth/callback/route.ts) verifies the just-Authorized TikTok account's handle against
-- `channel.tiktok_handle` — if the person that guard exists to keep honest could also edit the value
-- it's checked against, the guard would verify nothing. Handle stays Manager-only.

create or replace function public.update_channel_name(p_channel_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Tên kênh không được để trống.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.channel
    where id = p_channel_id and current_creator_id = auth.uid()
  ) then
    raise exception 'Bạn chỉ sửa được kênh mình đang phụ trách.' using errcode = '42501';
  end if;

  update public.channel set name = trim(p_name) where id = p_channel_id;
end;
$$;

revoke all on function public.update_channel_name(uuid, text) from public;
grant execute on function public.update_channel_name(uuid, text) to authenticated;

comment on function public.update_channel_name(uuid, text) is
  'Creator-safe channel rename. Checks auth.uid() = channel.current_creator_id itself — callable by '
  'any authenticated user, but only actually renames a channel that user is currently assigned to. '
  'Manager keeps using the normal PATCH /api/channels/:id path (RLS already allows it full write).';
