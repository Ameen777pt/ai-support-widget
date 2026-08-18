import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const isExternalUrl = next.startsWith("http://") || next.startsWith("https://");
      const redirectUrl = isExternalUrl ? `${origin}/dashboard` : `${origin}${next.startsWith("/") ? next : `/${next}`}`;
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Return user to login with error parameter if code exchange fails
  return NextResponse.redirect(`${origin}/login?error=Authentication+failed+or+link+expired`);
}
