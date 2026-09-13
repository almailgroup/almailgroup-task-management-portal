import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Routes reachable without a session. Everything else requires sign-in.
 *
 * Prefix matching is used for these, so "/auth" also covers "/auth/callback".
 * The landing page is matched exactly — treating "/" as a prefix would make
 * the entire app public.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/auth",
  "/forgot-password",
  // Machine-to-machine endpoints. These never carry a user session — the cron
  // dispatcher and the Telegram webhook authenticate with their own shared
  // secrets — so redirecting them to /login would silently stop reminders.
  "/api/reminders",
  "/api/telegram",
];
const PUBLIC_EXACT = ["/"];

function isPublicRoute(pathname: string) {
  if (PUBLIC_EXACT.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Refreshes the Supabase auth session on every request and gates private
 * routes.
 *
 * The `supabaseResponse` object must be returned as-is — replacing it would
 * drop the refreshed auth cookies and silently log users out.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Without credentials there is no session to refresh, and any authenticated
  // page would throw when it built a client. Send those to the landing page,
  // which explains what is missing, instead of surfacing a 500.
  if (!isSupabaseConfigured()) {
    if (isPublicRoute(request.nextUrl.pathname)) return supabaseResponse;

    const setupUrl = request.nextUrl.clone();
    setupUrl.pathname = "/";
    setupUrl.search = "";
    return NextResponse.redirect(setupUrl);
  }

  const supabase = createServerClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not insert logic between client creation and getUser(): getUser()
  // revalidates the token with Supabase and is what refreshes the cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicRoute(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    // Preserve the destination so sign-in can return the user to it.
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (pathname === "/login" || pathname === "/register")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
