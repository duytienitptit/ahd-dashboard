import { createClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/env";

/**
 * Service-role client. BYPASSES RLS COMPLETELY — every caller must check permission itself first,
 * usually with `requireManager()` from `lib/auth.ts`.
 *
 * Legitimate uses are narrow:
 *   1. Auth admin calls (a Manager creating a Creator account; the seed script).
 *   2. Reading and writing `channel_oauth`, which no signed-in role can touch.
 *   3. The daily Display API cron, which runs with no user session at all.
 *   4. `resolveLoginEmail()` (`lib/auth.ts`) — the pre-authentication username→email lookup at
 *      login. No session exists yet at that point, so there is no `requireManager()` to call first;
 *      this is the one place that's an inherent exception rather than a shortcut.
 *
 * Anything else belongs on `createSupabaseServerClient()`.
 */
export function createSupabaseAdminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
