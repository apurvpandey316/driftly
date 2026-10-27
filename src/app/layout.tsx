import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { Sidebar } from "@/components/sidebar";
import { authEnabled, getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Driftly",
  description: "Detect database schema drift across environments.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  // With sign-in on, only the login page renders without a user, and it brings its own layout.
  const bare = authEnabled && !user;

  return (
    <html lang="en">
      <body className="antialiased">
        {bare ? (
          <main>{children}</main>
        ) : (
          <div className="flex min-h-screen">
            <Sidebar userEmail={user?.email} />
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
