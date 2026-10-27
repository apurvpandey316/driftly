import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { authEnabled, getCurrentUser, isListedEmail } from "./auth";

// With sign-in off, everything lives in one local workspace.
// With sign-in on, each user gets their own; every query already filters by workspace id.
const LOCAL_OWNER = "local";

export async function getWorkspaceId(): Promise<string> {
  if (!authEnabled) return findOrCreate(LOCAL_OWNER);

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const own = await findWorkspace(user.id);
  if (own) return own;

  // Data created before sign-in was turned on stays in the "local" workspace. Hand it to
  // the first user named in ALLOWED_EMAILS, never to an arbitrary sign-up.
  if (isListedEmail(user.email)) {
    const [claimed] = await db
      .update(workspaces)
      .set({ ownerId: user.id })
      .where(eq(workspaces.ownerId, LOCAL_OWNER))
      .returning({ id: workspaces.id });
    if (claimed) return claimed.id;
  }
  return findOrCreate(user.id);
}

async function findWorkspace(ownerId: string): Promise<string | undefined> {
  const existing = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.ownerId, ownerId))
    .limit(1);
  return existing[0]?.id;
}

async function findOrCreate(ownerId: string): Promise<string> {
  const existing = await findWorkspace(ownerId);
  if (existing) return existing;

  const [created] = await db
    .insert(workspaces)
    .values({ name: "My workspace", ownerId })
    .returning({ id: workspaces.id });
  return created.id;
}
