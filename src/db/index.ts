import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Reuse one pool across hot reloads in development, otherwise every file save
// opens new connections and the Supabase pooler runs out.
const globalForDb = globalThis as unknown as { driftlyPool?: Pool };

const pool =
  globalForDb.driftlyPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.driftlyPool = pool;

export const db = drizzle(pool, { schema });
