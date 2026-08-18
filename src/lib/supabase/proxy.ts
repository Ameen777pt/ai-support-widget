import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { type Database } from "@/types/database.types";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Identity / JWT verification in proxy using getClaims or getUser
  const { data: claimsData, error } = typeof (supabase.auth as unknown as Record<string, unknown>).getClaims === "function"
    ? await ((supabase.auth as unknown as { getClaims: () => Promise<{ data: unknown; error: unknown }> }).getClaims())
    : await supabase.auth.getUser();

  const user = (claimsData as { user?: unknown })?.user ?? (claimsData as { sub?: string })?.sub ?? null;
  const isAuthenticated = !error && Boolean(user);

  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  const isProtectedPath = pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding");
  const isAuthPath = pathname === "/login" || pathname === "/signup";

  // Redirect unauthenticated users attempting to access protected routes
  if (!isAuthenticated && isProtectedPath) {
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users attempting to access login/signup
  if (isAuthenticated && isAuthPath) {
    url.pathname = "/dashboard";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return response;
}
