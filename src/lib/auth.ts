import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Sign-in is on whenever Supabase is configured. Without it Driftly runs as a single local workspace. */
export const authEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function isAllowedEmail(email: string | undefined): boolean {
  const allowed = allowedEmails();
  if (!allowed.length) return true;
  return Boolean(email && allowed.includes(email.toLowerCase()));
}

/** True only when ALLOWED_EMAILS names this address explicitly (not just "anyone may sign in"). */
export function isListedEmail(email: string | undefined): boolean {
  return Boolean(email && allowedEmails().includes(email.toLowerCase()));
}

function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Supabase client bound to the request cookies. Only call when authEnabled. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server Components can't write cookies; the middleware refreshes the session instead.
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {}
      },
    },
  });
}

export interface CurrentUser {
  id: string;
  email: string;
}

/** The signed-in user, or null (always null when sign-in is off). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!authEnabled) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !isAllowedEmail(data.user.email)) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}
