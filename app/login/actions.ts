"use server";

import { redirect } from "next/navigation";

import { getCurrentUser, resolveLoginEmail } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null; username: string };

/** Only same-origin paths, so `?next=` cannot be used to bounce a user off-site. */
function safeRedirectTarget(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function signIn(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Vui lòng nhập tên đăng nhập và mật khẩu.", username };
  }

  const email = await resolveLoginEmail(username);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  // One message for both wrong-password and unknown-username: telling them apart would confirm
  // which usernames have accounts.
  if (error) {
    return { error: "Tên đăng nhập hoặc mật khẩu không đúng.", username };
  }

  // Authenticating is not enough — an auth user with no manager/creator row has no role, which
  // happens when an account is created straight in the Supabase dashboard.
  const user = await getCurrentUser();
  if (!user) {
    await supabase.auth.signOut();
    return { error: "Tài khoản chưa được cấp quyền. Liên hệ quản lý.", username };
  }

  redirect(safeRedirectTarget(formData.get("next")));
}
