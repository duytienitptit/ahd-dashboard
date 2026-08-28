import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { requireEnv } from "@/lib/env";

/**
 * Runs before every request (Next 16 renamed this file convention from `middleware` to `proxy`).
 *
 * Two jobs: keep the Supabase session cookie fresh, and keep signed-out visitors out of the app.
 * Role checks do NOT belong here — they need database lookups and live in `lib/auth.ts`.
 */

/** Reachable without a session. `/api/oauth/callback` is here because TikTok calls it directly.
 *  `/tiktok0archA9IxK5WFiSpJsLU9PuyBgeCxmBY.txt` is TikTok's Developer Portal site-verification
 *  file (public/) — their verifier fetches it unauthenticated, same reason as the callback.
 *
 *  `/api/sync/display-api` is NOT actually public — it guards itself: GET compares `CRON_SECRET`
 *  with timingSafeEqual, POST calls requireManager(). It has to sit here because Vercel Cron sends
 *  a plain GET with no session cookie, so leaving it behind this gate turned every cron run into a
 *  307 → /login and the handler never ran at all (diagnosed 28/08/2026: data_snapshot held exactly
 *  one display_api day, and its timestamps were both manual "Chạy đồng bộ ngay" clicks). Anything
 *  else called by an external service — a cron, a webhook, another verification file — needs the
 *  same treatment plus its own in-handler auth. */
const PUBLIC_PATHS = [
  "/login",
  "/terms",
  "/privacy",
  "/api/oauth/callback",
  "/api/sync/display-api",
  "/tiktok0archA9IxK5WFiSpJsLU9PuyBgeCxmBY.txt",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase and rotates the cookie when needed. Do not
  // replace it with getSession(), which trusts whatever the cookie claims.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
