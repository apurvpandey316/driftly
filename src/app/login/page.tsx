import { redirect } from "next/navigation";
import { authEnabled, getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Driftly" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (!authEnabled || (await getCurrentUser())) redirect("/dashboard");
  const { next, error } = await searchParams;

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-bg">D</span>
          <span className="text-lg font-semibold tracking-tight">Driftly</span>
        </div>
        <LoginForm next={next ?? ""} initialError={error === "callback" ? "That sign-in link is invalid or has expired." : undefined} />
      </div>
    </div>
  );
}
