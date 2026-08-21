import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { requireEnv } from "@/lib/env";

/**
 * Supabase client bound to the signed-in user's session cookie.
 *
 * Use this everywhere in Server Components and Route Handlers: queries run as that user, so RLS
 * decides what they can see and change. Reach for `lib/supabase/admin.ts` only where RLS must be
 * bypassed on purpose.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Harmless: proxy.ts refreshes the session on
            // every request, so the rotated cookie is written there instead.
          }
        },
      },
    },
  );
}
