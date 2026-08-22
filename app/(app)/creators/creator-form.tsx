"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import type { CreatorSummary } from "@/lib/creators";
import type { TeamSummary } from "@/lib/teams";

import { ConfirmDeleteForm } from "../confirm-delete-form";
import {
  createCreatorAction,
  createTeamAction,
  deleteCreatorAction,
  deleteTeamAction,
  renameTeamAction,
  resetCreatorPasswordAction,
  updateCreatorAction,
  type CreatorFormState,
  type PasswordFormState,
  type TeamFormState,
  type UpdateCreatorFormState,
} from "./actions";

const teamInitialState: TeamFormState = { error: null };
const passwordInitialState: PasswordFormState = { error: null, newPassword: null };

function TeamSelect({ teams, defaultValue }: { teams: { id: string; name: string }[]; defaultValue?: string }) {
  return (
    <select
      name="teamId"
      defaultValue={defaultValue ?? ""}
      className="h-[40px] w-full rounded-input border border-line bg-bg px-3 text-sm outline-none focus:border-ink"
    >
      <option value="">— Chưa gán team —</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      ))}
    </select>
  );
}

function TeamGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

/** Manager-only: create/rename/delete Team. Team is purely an organizational label (CLAUDE.md,
 *  21/08/2026) — deleting one never deletes its Creators, just unassigns them. Row styling matches
 *  the rest of the app's list rows (ConnectionsClient/ChannelRow: avatar + divider + bordered action
 *  buttons) — the plain text-link rows from the first pass read as unstyled next to those. */
export function TeamManager({ teams }: { teams: TeamSummary[] }) {
  const [creating, setCreating] = useState(false);
  const [state, formAction, pending] = useActionState(createTeamAction, teamInitialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setCreating(false);
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <div className="mb-4 overflow-hidden rounded-card border border-line">
      <div className="flex items-center justify-between px-5 py-[18px]">
        <div>
          <div className="text-[15px] font-bold">Team</div>
          <div className="mt-[3px] text-xs text-ink-3">Nhóm Creator để lọc và xem theo team</div>
        </div>
        {!creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-8 items-center rounded-btn border border-line px-3.5 text-[12.5px] font-semibold hover:bg-surface"
          >
            + Thêm team
          </button>
        ) : null}
      </div>

      {creating ? (
        <div className="border-t border-line-soft px-5 py-4">
          <form action={formAction} className="flex items-end gap-2">
            <label className="block flex-grow">
              <span className="mb-1.5 block text-[12px] font-semibold">Tên team</span>
              <input
                name="name"
                required
                autoFocus
                className="h-[36px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="h-[36px] rounded-btn bg-red px-3.5 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Đang lưu…" : "Lưu"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="h-[36px] rounded-btn border border-line px-3.5 text-[12.5px] font-semibold hover:bg-surface"
            >
              Huỷ
            </button>
          </form>
          <div className="mt-2">
            <ErrorBox error={state.error} />
          </div>
        </div>
      ) : null}

      {teams.length === 0 ? (
        <p className="border-t border-line-soft px-5 py-4 text-[12.5px] text-ink-3">
          Chưa có team nào — Creator sẽ hiện ở “Chưa gán team”.
        </p>
      ) : (
        teams.map((team) => <TeamRow key={team.id} team={team} />)
      )}
    </div>
  );
}

function TeamRow({ team }: { team: TeamSummary }) {
  const [editing, setEditing] = useState(false);
  const boundAction = renameTeamAction.bind(null, team.id);
  const [state, formAction, pending] = useActionState(boundAction, teamInitialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setEditing(false);
    wasPending.current = pending;
  }, [pending, state.error]);

  if (editing) {
    return (
      <form action={formAction} className="border-t border-line-soft px-5 py-3.5">
        <div className="flex items-center gap-2">
          <input
            name="name"
            required
            defaultValue={team.name}
            autoFocus
            className="h-[36px] flex-grow rounded-input border border-line px-2.5 text-[13px] outline-none focus:border-ink"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-8 rounded-btn bg-red px-3.5 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            Lưu
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-8 rounded-btn border border-line px-3.5 text-[12.5px] font-semibold hover:bg-surface"
          >
            Huỷ
          </button>
        </div>
        <div className="mt-2">
          <ErrorBox error={state.error} />
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line-soft px-5 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-cyan-bg text-cyan-ink-2">
          <TeamGlyph />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-bold">{team.name}</span>
          <span className="rounded-pill bg-line-soft px-2 py-[2px] text-[11px] font-semibold text-ink-2">
            {team.creatorCount} creator
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex h-8 items-center rounded-btn border border-line px-3 text-[12.5px] font-semibold hover:bg-surface"
        >
          Sửa
        </button>
        <form
          action={async () => {
            const message =
              team.creatorCount > 0
                ? `Xoá team "${team.name}"? ${team.creatorCount} creator sẽ thành chưa gán team.`
                : `Xoá team "${team.name}"?`;
            if (!confirm(message)) return;
            await deleteTeamAction(team.id);
          }}
        >
          <button
            type="submit"
            aria-label={`Xoá team ${team.name}`}
            title="Xoá team"
            className="flex h-8 w-8 items-center justify-center rounded-btn border border-line text-ink-3 hover:border-red-dark hover:text-red-dark"
          >
            <TrashGlyph />
          </button>
        </form>
      </div>
    </div>
  );
}

const createInitialState: CreatorFormState = { error: null, created: null, tempPassword: null };
const updateInitialState: UpdateCreatorFormState = { error: null };

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-input bg-red-bg px-3 py-2 text-[12.5px] font-medium text-red-dark">
      {error}
    </div>
  );
}

/** Shows the just-created account's password exactly once — it is never stored or shown again. */
function CreatedNotice({ creator, password, onDismiss }: { creator: CreatorSummary; password: string; onDismiss: () => void }) {
  return (
    <div className="mb-4 rounded-card border border-line bg-cyan-bg p-4">
      <div className="text-[13px] font-bold text-cyan-ink">
        Đã tạo tài khoản cho {creator.name} ({creator.username})
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[12.5px] text-cyan-ink-2">Mật khẩu:</span>
        <code className="rounded-[4px] bg-bg px-2 py-1 text-[13px] font-semibold">{password}</code>
      </div>
      <p className="mt-2 text-[11.5px] text-cyan-ink-2">
        Gửi tên đăng nhập và mật khẩu này riêng cho Creator — trang sẽ không hiển thị lại. Chưa có gửi tự động.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 text-[12.5px] font-semibold text-cyan-ink underline underline-offset-2"
      >
        Đã gửi, ẩn thông báo
      </button>
    </div>
  );
}

export function CreateCreatorForm({ teams }: { teams: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createCreatorAction, createInitialState);
  const wasPending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setOpen(false);
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <div>
      {state.created && state.tempPassword ? (
        <CreatedNotice
          creator={state.created}
          password={state.tempPassword}
          onDismiss={() => {
            // Clearing local UI state only — the action's returned state itself isn't resettable,
            // so a dismissed notice simply won't remount until the next successful create.
            formRef.current?.reset();
          }}
        />
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-[38px] items-center rounded-btn bg-red px-[18px] text-sm font-bold text-white hover:opacity-90"
        >
          + Tạo tài khoản
        </button>
      ) : (
        <form ref={formRef} action={formAction} className="mb-4 rounded-card border border-line p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-bold">Tên</span>
              <input
                name="name"
                required
                className="h-[40px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-bold">Tên đăng nhập</span>
              <input
                name="username"
                type="text"
                required
                placeholder="ten-dang-nhap"
                pattern="[a-z0-9._-]{3,32}"
                title="Chữ thường, số, dấu chấm/gạch dưới/gạch ngang, 3-32 ký tự"
                className="h-[40px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-bold">Mật khẩu</span>
              <input
                name="password"
                type="text"
                required
                minLength={8}
                placeholder="≥ 8 ký tự"
                className="h-[40px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-bold">Team</span>
              <TeamSelect teams={teams} />
            </label>
          </div>

          <div className="mt-2">
            <ErrorBox error={state.error} />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="h-[38px] rounded-btn bg-red px-4 text-[13.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Đang tạo…" : "Tạo tài khoản"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-[38px] rounded-btn border border-line px-4 text-[13.5px] font-semibold hover:bg-surface"
            >
              Huỷ
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Reveals a just-set temp password exactly once, same pattern as `CreatedNotice` above. */
function ResetPasswordForm({ creatorId, onDone }: { creatorId: string; onDone: () => void }) {
  const boundAction = resetCreatorPasswordAction.bind(null, creatorId);
  const [state, formAction, pending] = useActionState(boundAction, passwordInitialState);

  if (state.newPassword) {
    return (
      <div className="rounded-card border border-line bg-cyan-bg p-4">
        <div className="text-[13px] font-bold text-cyan-ink">Đã đặt mật khẩu mới</div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[12.5px] text-cyan-ink-2">Mật khẩu mới:</span>
          <code className="rounded-[4px] bg-bg px-2 py-1 text-[13px] font-semibold">{state.newPassword}</code>
        </div>
        <p className="mt-2 text-[11.5px] text-cyan-ink-2">
          Gửi mật khẩu này riêng cho Creator — trang sẽ không hiển thị lại.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-3 text-[12.5px] font-semibold text-cyan-ink underline underline-offset-2"
        >
          Xong
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-card border border-line p-4">
      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-bold">Mật khẩu mới</span>
        <input
          name="password"
          type="text"
          required
          minLength={8}
          placeholder="≥ 8 ký tự"
          autoComplete="off"
          className="h-[38px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
        />
      </label>

      <div className="mt-2">
        <ErrorBox error={state.error} />
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-[36px] rounded-btn bg-red px-3.5 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Đang đặt…" : "Đặt mật khẩu mới"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-[36px] rounded-btn border border-line px-3.5 text-[12.5px] font-semibold hover:bg-surface"
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}

type EditPanel = "edit" | "password" | "delete";

/**
 * Manager-only edit form for one Creator — extracted from the old `CreatorCard` so both the
 * `/creators` accordion row and the `/creators/[id]` detail page can toggle the exact same form
 * instead of keeping two copies in sync. `onClose` fires both on "Huỷ" and right after a successful
 * save (same behavior `CreatorCard` had: closing is closing, the caller doesn't need to know why).
 *
 * Three panels sharing one component (21/08/2026 follow-up — "đầy đủ CRUD"): the Tên/Team/Đang hoạt
 * động fields (`edit`, default), a password reset (`password`), and hard delete (`delete`,
 * type-to-confirm via `ConfirmDeleteForm`) — switched locally, never all visible at once, so a
 * destructive action is never one accidental click away from a routine save.
 */
export function CreatorEditForm({
  creator,
  teams,
  onClose,
}: {
  creator: { id: string; name: string; isActive: boolean; team: { id: string; name: string } | null };
  teams: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [panel, setPanel] = useState<EditPanel>("edit");
  const boundAction = updateCreatorAction.bind(null, creator.id);
  const [state, formAction, pending] = useActionState(boundAction, updateInitialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) onClose();
    wasPending.current = pending;
    // `onClose` intentionally left out of deps — callers pass an inline arrow (`() => setEditing(false)`),
    // a new function identity every render; depending on it would re-fire this effect every render too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state.error]);

  if (panel === "password") {
    return <ResetPasswordForm creatorId={creator.id} onDone={() => setPanel("edit")} />;
  }

  if (panel === "delete") {
    return (
      <ConfirmDeleteForm
        action={deleteCreatorAction.bind(null, creator.id)}
        entityName={creator.name}
        fieldLabel="tên nhân sự"
        warning={`Xoá vĩnh viễn "${creator.name}" — mất tài khoản đăng nhập và lịch sử phụ trách kênh của người này. Kênh đang phụ trách sẽ thành "chưa gán", không bị xoá. Không thể hoàn tác.`}
        onCancel={() => setPanel("edit")}
      />
    );
  }

  return (
    <form action={formAction} className="rounded-card border border-line p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-bold">Tên</span>
          <input
            name="name"
            required
            defaultValue={creator.name}
            className="h-[38px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-bold">Team</span>
          <TeamSelect teams={teams} defaultValue={creator.team?.id} />
        </label>
        <label className="flex items-center gap-2 pt-6 text-[13px] font-medium">
          <input type="checkbox" name="isActive" defaultChecked={creator.isActive} className="h-4 w-4" />
          Đang hoạt động
        </label>
      </div>

      <div className="mt-2">
        <ErrorBox error={state.error} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-[36px] rounded-btn bg-red px-3.5 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Đang lưu…" : "Lưu"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-[36px] rounded-btn border border-line px-3.5 text-[12.5px] font-semibold hover:bg-surface"
        >
          Huỷ
        </button>
        <span className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPanel("password")}
            className="text-[12px] font-semibold text-ink-3 underline underline-offset-2 hover:text-ink"
          >
            Đổi mật khẩu
          </button>
          <button
            type="button"
            onClick={() => setPanel("delete")}
            className="text-[12px] font-semibold text-red-dark underline underline-offset-2 hover:opacity-80"
          >
            Xoá nhân sự
          </button>
        </span>
      </div>
    </form>
  );
}
