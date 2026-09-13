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
const PUBLIC_PREFIXES = ["/login", "/register", "/auth", "/forgot-password"];
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

  // Without credentials there is no session to refresh; let the request through
  // so the app can render its own "not configured" guidance.
  if (!isSupabaseConfigured()) {
    return supabaseResponse;
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
