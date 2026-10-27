import "server-only";
import { and, count, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { connections, scans } from "@/db/schema";
import type { ConnectionConfig } from "@/engine";
import { decryptSecret } from "./crypto";
import { getWorkspaceId } from "./workspace";

export const PROVIDERS = ["postgresql", "supabase"] as const;
export const ENVIRONMENTS = ["development", "staging", "production", "custom"] as const;
export const SSL_MODES = ["disable", "require", "verify-full"] as const;

export type Provider = (typeof PROVIDERS)[number];
export type Environment = (typeof ENVIRONMENTS)[number];
export type SslMode = (typeof SSL_MODES)[number];

/**
 * The only shape of a connection that may be sent to the browser.
 * It deliberately has no password field.
 */
export interface PublicConnection {
  id: string;
  name: string;
  provider: Provider;
  environment: Environment;
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: SslMode;
  includedSchemas: string[];
  disabled: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  scanCount: number;
}

// Explicit column list: the encrypted password is never selected for the UI.
const publicColumns = {
  id: connections.id,
  name: connections.name,
  provider: connections.provider,
  environment: connections.environment,
  host: connections.host,
  port: connections.port,
  database: connections.database,
  username: connections.username,
  sslMode: connections.sslMode,
  includedSchemas: connections.includedSchemas,
  disabled: connections.disabled,
  lastTestedAt: connections.lastTestedAt,
  lastTestOk: connections.lastTestOk,
};

type PublicRow = Omit<PublicConnection, "sslMode" | "lastTestedAt" | "scanCount"> & {
  sslMode: string;
  lastTestedAt: Date | null;
};

function toPublic(row: PublicRow, scanCount: number): PublicConnection {
  return {
    ...row,
    sslMode: row.sslMode as SslMode,
    lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    scanCount,
  };
}

async function scanCounts(workspaceId: string): Promise<Map<string, number>> {
  const ref = await db
    .select({ id: scans.referenceConnectionId, n: count() })
    .from(scans)
    .where(eq(scans.workspaceId, workspaceId))
    .groupBy(scans.referenceConnectionId);
  const tgt = await db
    .select({ id: scans.targetConnectionId, n: count() })
    .from(scans)
    .where(eq(scans.workspaceId, workspaceId))
    .groupBy(scans.targetConnectionId);
  const out = new Map<string, number>();
  for (const r of [...ref, ...tgt]) out.set(r.id, (out.get(r.id) ?? 0) + r.n);
  return out;
}

export async function listConnections(): Promise<PublicConnection[]> {
  const workspaceId = await getWorkspaceId();
  const rows = await db
    .select(publicColumns)
    .from(connections)
    .where(eq(connections.workspaceId, workspaceId))
    .orderBy(desc(connections.createdAt));
  const counts = await scanCounts(workspaceId);
  return rows.map((r) => toPublic(r, counts.get(r.id) ?? 0));
}

export async function getConnection(id: string): Promise<PublicConnection | null> {
  const workspaceId = await getWorkspaceId();
  const [row] = await db
    .select(publicColumns)
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.workspaceId, workspaceId)));
  if (!row) return null;
  const [{ n }] = await db
    .select({ n: count() })
    .from(scans)
    .where(or(eq(scans.referenceConnectionId, id), eq(scans.targetConnectionId, id)));
  return toPublic(row, n);
}

/** Server-only: builds engine config including the decrypted password. Never return this to the client. */
export async function getEngineConfig(id: string): Promise<{ config: ConnectionConfig; schemas: string[] } | null> {
  const workspaceId = await getWorkspaceId();
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.workspaceId, workspaceId)));
  if (!row) return null;
  return {
    config: {
      host: row.host,
      port: row.port,
      database: row.database,
      user: row.username,
      password: decryptSecret(row.passwordEncrypted),
      sslMode: row.sslMode as SslMode,
    },
    schemas: row.includedSchemas,
  };
}
