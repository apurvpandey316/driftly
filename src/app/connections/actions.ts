"use server";

import { and, eq, or, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { connections, scans } from "@/db/schema";
import { testConnection, type ConnectionConfig, type ConnectionTestResult } from "@/engine";
import { encryptSecret } from "@/lib/crypto";
import { ENVIRONMENTS, PROVIDERS, SSL_MODES, getEngineConfig, type Environment, type Provider, type SslMode } from "@/lib/connections";
import { getWorkspaceId } from "@/lib/workspace";

export interface ConnectionInput {
  name: string;
  provider: string;
  environment: string;
  host: string;
  port: number | string;
  database: string;
  username: string;
  /** Blank on edit means "keep the saved password". */
  password?: string;
  sslMode: string;
  includedSchemas: string[];
}

export type FieldErrors = Partial<Record<keyof ConnectionInput, string>>;
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: FieldErrors };

interface Clean {
  name: string;
  provider: Provider;
  environment: Environment;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: SslMode;
  includedSchemas: string[];
}

function validate(input: ConnectionInput, { requirePassword }: { requirePassword: boolean }) {
  const e: FieldErrors = {};
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = s(input.name);
  const host = s(input.host);
  const database = s(input.database);
  const username = s(input.username);
  const password = typeof input.password === "string" ? input.password : "";
  const port = Number(input.port);
  const includedSchemas = [...new Set((input.includedSchemas ?? []).map((x) => s(x)).filter(Boolean))];

  if (!name) e.name = "Give the connection a name.";
  else if (name.length > 80) e.name = "Keep the name under 80 characters.";
  if (!PROVIDERS.includes(input.provider as Provider)) e.provider = "Choose a provider.";
  if (!ENVIRONMENTS.includes(input.environment as Environment)) e.environment = "Choose an environment.";
  if (!host) e.host = "Enter the database host.";
  else if (host.includes("://") || host.includes("@")) e.host = "Enter only the host name. Paste full URLs into the URL box above.";
  if (!Number.isInteger(port) || port < 1 || port > 65535) e.port = "Port must be between 1 and 65535.";
  if (!database) e.database = "Enter the database name.";
  if (!username) e.username = "Enter the username.";
  if (requirePassword && !password) e.password = "Enter the password.";
  if (!SSL_MODES.includes(input.sslMode as SslMode)) e.sslMode = "Choose an SSL mode.";
  if (!includedSchemas.length) e.includedSchemas = "Include at least one schema.";

  if (Object.keys(e).length) return { ok: false as const, fieldErrors: e };
  return {
    ok: true as const,
    value: {
      name,
      provider: input.provider as Provider,
      environment: input.environment as Environment,
      host,
      port,
      database,
      username,
      password,
      sslMode: input.sslMode as SslMode,
      includedSchemas,
    } satisfies Clean,
  };
}

/** Turns driver errors into something a person can act on. */
function friendly(message: string | undefined, host?: string): string {
  const m = message ?? "Unknown error";
  if (/ECONNREFUSED/.test(m)) return `Nothing is accepting connections at ${host ?? "that address"}. Is the database running and the port correct?`;
  if (/ENOTFOUND|EAI_AGAIN/.test(m)) return `Host "${host}" could not be found. Check the spelling.`;
  if (/timeout|ETIMEDOUT/i.test(m))
    return "The connection timed out. Check the host and port, firewall rules, and for Supabase use the Session pooler host.";
  if (/password authentication failed/i.test(m)) return "Username or password is incorrect.";
  if (/database ".*" does not exist/i.test(m)) return m.charAt(0).toUpperCase() + m.slice(1) + ".";
  if (/SSL|self.signed|certificate/i.test(m)) return `SSL problem: ${m}. Try a different SSL mode.`;
  if (/no pg_hba\.conf entry/i.test(m)) return "The server rejected this connection (pg_hba.conf). It may require SSL or block your IP.";
  return m;
}

function toConfig(c: Clean, password: string): ConnectionConfig {
  return { host: c.host, port: c.port, database: c.database, user: c.username, password, sslMode: c.sslMode };
}

async function ownedConnection(id: string) {
  const workspaceId = await getWorkspaceId();
  const [row] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.workspaceId, workspaceId)));
  return row ? workspaceId : null;
}

export type TestOutcome = ActionResult<{ result: ConnectionTestResult }>;

/**
 * Tests the values currently in the form, before saving.
 * On edit with a blank password, the saved password is used.
 */
export async function testDraft(input: ConnectionInput, existingId?: string): Promise<TestOutcome> {
  const v = validate(input, { requirePassword: !existingId });
  if (!v.ok) return { ok: false, error: "Fix the highlighted fields first.", fieldErrors: v.fieldErrors };

  let password = v.value.password;
  if (!password && existingId) {
    const saved = await getEngineConfig(existingId);
    if (!saved) return { ok: false, error: "Connection not found." };
    password = saved.config.password ?? "";
  }
  const result = await testConnection(toConfig(v.value, password), v.value.includedSchemas);
  if (result.error) result.error = friendly(result.error, `${v.value.host}:${v.value.port}`);
  return { ok: true, result };
}

/** Re-tests a saved connection and records the outcome. */
export async function testSaved(id: string): Promise<TestOutcome> {
  const saved = await getEngineConfig(id);
  if (!saved) return { ok: false, error: "Connection not found." };
  const result = await testConnection(saved.config, saved.schemas);
  if (result.error) result.error = friendly(result.error, `${saved.config.host}:${saved.config.port}`);
  await db
    .update(connections)
    .set({ lastTestedAt: new Date(), lastTestOk: result.ok })
    .where(eq(connections.id, id));
  revalidatePath("/connections");
  return { ok: true, result };
}

export async function createConnection(input: ConnectionInput, tested?: boolean): Promise<ActionResult<{ id: string }>> {
  const v = validate(input, { requirePassword: true });
  if (!v.ok) return { ok: false, error: "Fix the highlighted fields.", fieldErrors: v.fieldErrors };
  const workspaceId = await getWorkspaceId();
  const { password, ...rest } = v.value;
  const [row] = await db
    .insert(connections)
    .values({
      ...rest,
      workspaceId,
      passwordEncrypted: encryptSecret(password),
      lastTestedAt: tested === undefined ? null : new Date(),
      lastTestOk: tested ?? null,
    })
    .returning({ id: connections.id });
  revalidatePath("/connections");
  return { ok: true, id: row.id };
}

/** Updates metadata. A non-blank password rotates the stored credential. */
export async function updateConnection(id: string, input: ConnectionInput, tested?: boolean): Promise<ActionResult> {
  if (!(await ownedConnection(id))) return { ok: false, error: "Connection not found." };
  const v = validate(input, { requirePassword: false });
  if (!v.ok) return { ok: false, error: "Fix the highlighted fields.", fieldErrors: v.fieldErrors };
  const { password, ...rest } = v.value;
  await db
    .update(connections)
    .set({
      ...rest,
      ...(password ? { passwordEncrypted: encryptSecret(password) } : {}),
      // Any edit invalidates the previous test unless the form was just tested.
      lastTestedAt: tested === undefined ? null : new Date(),
      lastTestOk: tested ?? null,
      updatedAt: new Date(),
    })
    .where(eq(connections.id, id));
  revalidatePath("/connections");
  return { ok: true };
}

export async function setDisabled(id: string, disabled: boolean): Promise<ActionResult> {
  if (!(await ownedConnection(id))) return { ok: false, error: "Connection not found." };
  await db.update(connections).set({ disabled, updatedAt: new Date() }).where(eq(connections.id, id));
  revalidatePath("/connections");
  return { ok: true };
}

export async function deleteConnection(id: string): Promise<ActionResult> {
  if (!(await ownedConnection(id))) return { ok: false, error: "Connection not found." };
  // Saved scans are immutable history: don't let a delete orphan them.
  const [{ n }] = await db
    .select({ n: count() })
    .from(scans)
    .where(or(eq(scans.referenceConnectionId, id), eq(scans.targetConnectionId, id)));
  if (n > 0)
    return {
      ok: false,
      error: `This connection is used by ${n} saved comparison${n === 1 ? "" : "s"}. Disable it instead to keep that history.`,
    };
  await db.delete(connections).where(eq(connections.id, id));
  revalidatePath("/connections");
  return { ok: true };
}
