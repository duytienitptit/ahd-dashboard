import { cache } from "react";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole = "manager" | "creator";

export type AppUser = {
  id: string;
  /** Supabase Auth's internal identifier — real for accounts created before 22/08/2026, synthetic
   *  (`{username}@creator.internal`) for newer ones. Never shown to a user or typed at login —
   *  `username` is. Kept mainly so `audit_log`/error paths that predate the username switch still
   *  have something to read without a schema change to those tables. */
  email: string;
  /** What the user actually typed to log in, and the only identifier shown in the UI (22/08/2026). */
  username: string;
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

  // A user is in exactly one of these tables — run both lookups in parallel instead of trying
  // manager first and only querying creator on a miss, which cost every Creator login a second
  // sequential round trip.
  const [{ data: manager }, { data: creator }] = await Promise.all([
    supabase.from("manager").select("id, name, email, username").eq("id", user.id).maybeSingle(),
    supabase.from("creator").select("id, name, email, username, is_active").eq("id", user.id).maybeSingle(),
  ]);

  if (manager) {
    return { id: manager.id, email: manager.email, username: manager.username, name: manager.name, role: "manager" };
  }

  if (creator?.is_active) {
    return { id: creator.id, email: creator.email, username: creator.username, name: creator.name, role: "creator" };
  }

  return null;
});

/**
 * Resolves what someone typed at login into the real (or synthetic) email Supabase Auth needs —
 * `signInWithPassword` only ever accepts email or phone, never an arbitrary username. Runs BEFORE
 * authentication, so this is the one legitimate place in the app that uses the admin client with no
 * `requireManager()` guard first: there is no session yet to gate on.
 *
 * Username-only login (22/08/2026, hardened further 22/08/2026): a raw email — even a real account's
 * real underlying email — is no longer accepted as a login identifier, only a `username` that
 * actually matches a `manager`/`creator` row. Returns `null` on no match (unknown username, or an
 * email-shaped input — `@` can never appear in a real username, so it can never match) instead of
 * falling through to the raw typed value; the caller must treat `null` as an immediate auth failure
 * without calling `signInWithPassword` at all, so a real email can never authenticate again even by
 * accident. By design the caller still can't tell "unknown username" apart from "wrong password" —
 * same reasoning app/login/actions.ts already applied when this was email-only.
 */
export async function resolveLoginEmail(identifier: string): Promise<string | null> {
  const value = identifier.trim().toLowerCase();
  if (!value) return null;

  const admin = createSupabaseAdminClient();
  const [{ data: manager }, { data: creator }] = await Promise.all([
    admin.from("manager").select("email").eq("username", value).maybeSingle(),
    admin.from("creator").select("email").eq("username", value).maybeSingle(),
  ]);
  return manager?.email ?? creator?.email ?? null;
}

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
