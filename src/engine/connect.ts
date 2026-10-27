import { Client, type ClientConfig } from "pg";
import type { ConnectionConfig } from "./types";

/** Schemas managed by PostgreSQL or Supabase. Never offered for comparison by default. */
export const VENDOR_SCHEMAS = new Set([
  "pg_catalog",
  "information_schema",
  "pg_toast",
  // Supabase-managed
  "auth",
  "storage",
  "realtime",
  "_realtime",
  "extensions",
  "graphql",
  "graphql_public",
  "vault",
  "pgsodium",
  "pgsodium_masks",
  "supabase_functions",
  "supabase_migrations",
  "net",
  "cron",
  "pgbouncer",
  "_analytics",
]);

function sslOption(mode: ConnectionConfig["sslMode"]): ClientConfig["ssl"] {
  if (mode === "require") return { rejectUnauthorized: false };
  if (mode === "verify-full") return { rejectUnauthorized: true };
  return false;
}

/**
 * Opens a client in a READ ONLY transaction with a statement timeout.
 * Driftly never writes to inspected databases; the read-only transaction is a
 * second safety net on top of using a least-privilege user.
 */
export async function openReadOnly(config: ConnectionConfig): Promise<Client> {
  const client = new Client({
    connectionString: config.connectionString,
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.connectionString && !config.sslMode ? undefined : sslOption(config.sslMode),
    connectionTimeoutMillis: config.connectTimeoutMs ?? 10_000,
    application_name: "driftly",
  });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY ISOLATION LEVEL REPEATABLE READ");
    await client.query(`SET LOCAL statement_timeout = ${Math.floor(config.queryTimeoutMs ?? 30_000)}`);
  } catch (err) {
    await client.end().catch(() => {});
    throw err;
  }
  return client;
}

export async function closeQuietly(client: Client | null) {
  if (!client) return;
  await client.query("ROLLBACK").catch(() => {});
  await client.end().catch(() => {});
}

/** Removes passwords from connection URLs or messages before they reach logs or the UI. */
export function redact(message: string): string {
  return message.replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1****@");
}

export interface ConnectionTestResult {
  ok: boolean;
  serverVersion?: string;
  /** Requested schemas that don't exist. */
  missingSchemas: string[];
  /** Requested schemas the user can't use. */
  schemasWithoutUsage: string[];
  /** Non-vendor schemas available to pick from. */
  availableSchemas: string[];
  /** Advisory notes, e.g. the user has more privileges than Driftly needs. */
  warnings: string[];
  error?: string;
}

/** Validates connectivity and that metadata for the requested schemas can be inspected. */
export async function testConnection(config: ConnectionConfig, schemas: string[] = []): Promise<ConnectionTestResult> {
  let client: Client | null = null;
  try {
    client = await openReadOnly(config);
    const version = await client.query<{ v: string }>("select current_setting('server_version') as v");
    const ns = await client.query<{ name: string; usage: boolean }>(
      "select nspname as name, has_schema_privilege(oid, 'USAGE') as usage from pg_namespace order by 1",
    );
    const byName = new Map(ns.rows.map((r) => [r.name, r.usage]));
    const missingSchemas = schemas.filter((s) => !byName.has(s));
    const schemasWithoutUsage = schemas.filter((s) => byName.get(s) === false);

    // Driftly never writes, but least privilege is safer: flag users that could.
    const warnings: string[] = [];
    const role = await client.query<{ superuser: boolean; createdb: boolean }>(
      "select rolsuper as superuser, rolcreatedb as createdb from pg_roles where rolname = current_user",
    );
    if (role.rows[0]?.superuser) {
      warnings.push("This user is a superuser. Driftly only needs read access to catalog metadata; a read-only user is safer.");
    } else {
      const writable = await client.query<{ name: string }>(
        `select n.nspname as name from pg_namespace n
         where n.nspname = any($1) and has_schema_privilege(n.oid, 'CREATE')`,
        [schemas],
      );
      if (writable.rows.length) {
        warnings.push(
          `This user can create objects in: ${writable.rows.map((r) => r.name).join(", ")}. Driftly never writes, but a read-only user is safer.`,
        );
      }
    }
    return {
      ok: missingSchemas.length === 0 && schemasWithoutUsage.length === 0,
      serverVersion: version.rows[0].v.split(" ")[0],
      missingSchemas,
      schemasWithoutUsage,
      availableSchemas: ns.rows.map((r) => r.name).filter((n) => !VENDOR_SCHEMAS.has(n) && !n.startsWith("pg_")),
      warnings,
    };
  } catch (err) {
    return {
      ok: false,
      missingSchemas: [],
      schemasWithoutUsage: [],
      availableSchemas: [],
      warnings: [],
      error: redact(err instanceof Error ? err.message : String(err)),
    };
  } finally {
    await closeQuietly(client);
  }
}
