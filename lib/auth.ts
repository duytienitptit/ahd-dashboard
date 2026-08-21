import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole = "manager" | "creator";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
};

/** Thrown by the require* helpers; route handlers turn `status` into the HTTP response. */
export class AuthorizationError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * The signed-in user together with their role, resolved on the server.
 *
 * The role comes from the `manager` / `creator` tables, never from a client claim. An auth user
 * with no row in either table has no role and is treated as not signed in — that state happens
 * when someone is created directly in the Supabase Auth dashboard without the matching row.
 *
 * Wrapped in React `cache()`: the layout and the page it renders both need the user, and without
 * this each of them pays for a fresh `auth.getUser()` — which is a network round trip to the
 * Supabase Auth server, not a local JWT decode — plus a repeat of the role lookup. Deduped per
 * request, so the second caller in the same render is free. Keep it wrapped.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: manager } = await supabase
    .from("manager")
    .select("id, name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (manager) {
    return { id: manager.id, email: manager.email, name: manager.name, role: "manager" };
  }

  const { data: creator } = await supabase
    .from("creator")
    .select("id, name, email, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (creator?.is_active) {
    return { id: creator.id, email: creator.email, name: creator.name, role: "creator" };
  }

  return null;
});

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthorizationError(401, "Chưa đăng nhập.");
  }
  return user;
}

/** First line of every Manager-only route handler. RLS blocks the write anyway; this returns a
 *  clear 403 instead of an opaque database error. */
export async function requireManager(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== "manager") {
    throw new AuthorizationError(403, "Chỉ Manager được thực hiện thao tác này.");
  }
  return user;
}
