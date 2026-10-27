"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authEnabled, isAllowedEmail, supabaseServer } from "@/lib/auth";

export type AuthState = { error?: string; message?: string };

/** Only same-site paths, so ?next= can't send people to another site after sign-in. */
function safeNext(raw: FormDataEntryValue | null): string {
  const next = typeof raw === "string" ? raw : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function readCredentials(form: FormData) {
  return {
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  };
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!authEnabled) redirect("/dashboard");
  const { email, password } = readCredentials(form);
  if (!email || !password) return { error: "Enter your email and password." };
  if (!isAllowedEmail(email)) return { error: "This email isn't allowed to use this Driftly instance." };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/not confirmed/i.test(error.message)) return { error: "Confirm your email first, using the link we sent you." };
    return { error: "Email or password is incorrect." };
  }
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!authEnabled) redirect("/dashboard");
  const { email, password } = readCredentials(form);
  if (!email || !password) return { error: "Enter your email and password." };
  if (password.length < 8) return { error: "Use at least 8 characters for the password." };
  if (!isAllowedEmail(email)) return { error: "This email isn't allowed to use this Driftly instance." };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };
  // With email confirmation turned off in Supabase, the user is signed in straight away.
  if (data.session) redirect("/dashboard");
  return { message: "Check your inbox for a confirmation link, then sign in." };
}

export async function signOut() {
  if (authEnabled) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
