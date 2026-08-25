"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { signIn, type SignInState } from "./actions";

const initialState: SignInState = { error: null, username: "" };

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.4 0-10-7-10-7a18.45 18.45 0 0 1 4.22-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.4 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

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
  const [showPassword, setShowPassword] = useState(false);

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
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-[46px] w-full rounded-input border border-line px-[14px] pr-11 text-[15px] outline-none focus:border-ink"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            className="absolute right-0 top-0 flex h-[46px] w-11 items-center justify-center text-ink-3 hover:text-ink"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
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
