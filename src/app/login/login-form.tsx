"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/button";
import { Card, Field, Input } from "@/components/ui";
import { signIn, signUp, type AuthState } from "./actions";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signingIn] = useActionState<AuthState, FormData>(signIn, { error: initialError });
  const [signUpState, signUpAction, signingUp] = useActionState<AuthState, FormData>(signUp, {});
  const signup = mode === "signup";
  const state = signup ? signUpState : signInState;
  const pending = signingIn || signingUp;

  return (
    <Card className="p-6">
      <h1 className="text-base font-semibold">{signup ? "Create an account" : "Sign in"}</h1>
      <form action={signup ? signUpAction : signInAction} className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint={signup ? "At least 8 characters." : undefined}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 8 : undefined}
            required
          />
        </Field>
        {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        {state.message && <p role="status" className="text-sm text-ok">{state.message}</p>}
        <Button type="submit" disabled={pending} className="justify-center">
          {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {signup ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {signup ? "Already have an account?" : "New here?"}{" "}
        <button type="button" onClick={() => setMode(signup ? "signin" : "signup")} className="text-accent hover:underline">
          {signup ? "Sign in" : "Create an account"}
        </button>
      </p>
    </Card>
  );
}
