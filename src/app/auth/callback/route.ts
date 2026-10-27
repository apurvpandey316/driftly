import { NextResponse, type NextRequest } from "next/server";
import { authEnabled, supabaseServer } from "@/lib/auth";

/** Landing point for the email confirmation link: swaps the one-time code for a session. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (authEnabled && code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.redirect(new URL("/login?error=callback", request.url));
}
