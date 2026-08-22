"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signIn, type SignInState } from "./actions";

const initialState: SignInState = { error: null, username: "" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mb-[18px] flex h-[46px] w-full items-center justify-center rounded-input bg-red text-[14.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Đang đăng nhập…" : "Đăng nhập"}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signIn, initialState);

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="next" value={next} />

      <div className="mb-5">
        <label htmlFor="username" className="mb-2 block text-[13px] font-bold">
          Tên đăng nhập
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          placeholder="ten-dang-nhap"
          defaultValue={state.username}
          className="h-[46px] w-full rounded-input border border-line px-[14px] text-sm outline-none placeholder:text-[#c9c9cb] focus:border-ink"
        />
      </div>

      <div className="mb-[22px]">
        <label htmlFor="password" className="mb-2 block text-[13px] font-bold">
          Mật khẩu
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-[46px] w-full rounded-input border border-line px-[14px] text-[15px] outline-none focus:border-ink"
        />
      </div>

      {state.error ? (
        <div
          role="alert"
          className="mb-[18px] rounded-input bg-red-bg px-[14px] py-3 text-[12.5px] font-medium text-red-dark"
        >
          {state.error}
        </div>
      ) : null}

      <SubmitButton />
    </form>
  );
}
