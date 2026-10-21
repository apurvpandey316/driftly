import type { Client } from "pg";
import { redact } from "./connect";
import { normalizeDefault, normalizeIndexDefinition, normalizeType } from "./normalize";
import type { ObjectCategory, ScanError, ScanScope, Side, Snapshot, TableDef } from "./types";

// All queries read pg_catalog only. Catalog rows are visible to any role,
// so no SELECT privilege on application tables (or their rows) is needed.

const FK_ACTIONS: Record<string, string> = {
  a: "NO ACTION",
  r: "RESTRICT",
  c: "CASCADE",
  n: "SET NULL",
  d: "SET DEFAULT",
};
const FK_MATCH: Record<string, string> = { s: "SIMPLE", f: "FULL", p: "PARTIAL" };

const TABLES_SQL = `
  select n.nspname as schema, c.relname as name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and not c.relispartition and n.nspname = any($1)`;

const COLUMNS_SQL = `
  select n.nspname as schema, c.relname as table, a.attname as name, a.attnum as position,
         format_type(a.atttypid, a.atttypmod) as type, not a.attnotnull as nullable,
         pg_get_expr(d.adbin, d.adrelid) as default, a.attidentity::text as identity,
         a.attgenerated::text as generated
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where c.relkind in ('r', 'p') and not c.relispartition and a.attnum > 0 and not a.attisdropped
    and n.nspname = any($1)`;

const CONSTRAINTS_SQL = `
  select n.nspname as schema, c.relname as table, con.conname as name, con.contype::text as type,
         array(select a.attname from unnest(con.conkey) with ordinality k(num, ord)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.num order by k.ord)::text[] as columns,
         rn.nspname as ref_schema, rc.relname as ref_table,
         array(select a.attname from unnest(con.confkey) with ordinality k(num, ord)
               join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.num order by k.ord)::text[] as ref_columns,
         con.confupdtype::text as on_update, con.confdeltype::text as on_delete,
         con.confmatchtype::text as match, con.condeferrable as deferrable, con.condeferred as deferred,
         coalesce((select i.indnullsnotdistinct from pg_index i where i.indexrelid = con.conindid), false) as nulls_not_distinct
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_class rc on rc.oid = con.confrelid
  left join pg_namespace rn on rn.oid = rc.relnamespace
  where con.contype in ('p', 'u', 'f') and c.relkind in ('r', 'p') and not c.relispartition
    and n.nspname = any($1)`;

// PG < 15 has no indnullsnotdistinct; fall back without it.
const CONSTRAINTS_SQL_LEGACY = CONSTRAINTS_SQL.replace(
  /coalesce\(\(select i\.indnullsnotdistinct[^)]*\)\s*,\s*false\)/,
  "false",
);

const INDEXES_SQL = `
  select n.nspname as schema, c.relname as table, i.relname as name, ix.indisunique as unique,
         pg_get_indexdef(ix.indexrelid) as def
  from pg_index ix
  join pg_class i on i.oid = ix.indexrelid
  join pg_class c on c.oid = ix.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and not c.relispartition and n.nspname = any($1)
    and not exists (select 1 from pg_constraint k where k.conindid = ix.indexrelid and k.contype in ('p', 'u', 'x'))`;

function excluded(scope: ScanScope, schema: string, table: string): boolean {
  return (scope.excludeTables ?? []).some((t) => t === `${schema}.${table}` || t === table);
}

/**
 * Reads normalized metadata for one database. Failures in a category are
 * recorded (and the category marked incomplete) instead of aborting the scan.
 */
export async function inspect(
  client: Client,
  side: Side,
  scope: Required<ScanScope>,
  errors: ScanError[],
): Promise<Snapshot> {
  const schemas = scope.schemas;
  const incomplete = new Set<ObjectCategory>();
  const want = new Set(scope.categories);

  const meta = await client.query<{ version: string; db: string; num: number }>(
    "select current_setting('server_version') as version, current_database() as db, current_setting('server_version_num')::int as num",
  );
  const versionNum = meta.rows[0].num;

  // Schemas (+ privilege check: we can read the catalog without USAGE, but flag it anyway)
  const ns = await client.query<{ name: string; usage: boolean }>(
    "select nspname as name, has_schema_privilege(oid, 'USAGE') as usage from pg_namespace where nspname = any($1)",
    [schemas],
  );
  for (const r of ns.rows) {
    if (!r.usage) {
      errors.push({
        side,
        stage: "privileges",
        scope: r.name,
        message: `No USAGE privilege on schema "${r.name}". Results for it may be incomplete.`,
      });
    }
  }

  // Tables are mandatory: without them nothing can be compared.
  const tables: Record<string, TableDef> = {};
  const tRes = await client.query<{ schema: string; name: string }>(TABLES_SQL, [schemas]);
  for (const r of tRes.rows) {
    if (excluded(scope, r.schema, r.name)) continue;
    tables[`${r.schema}.${r.name}`] = {
      schema: r.schema,
      name: r.name,
      columns: {},
      primaryKey: null,
      foreignKeys: {},
      uniques: {},
      indexes: {},
    };
  }
  const get = (schema: string, table: string) => tables[`${schema}.${table}`];

  // Runs one category query; on failure records the error and marks the categories incomplete.
  async function safely(categories: ObjectCategory[], fn: () => Promise<void>) {
    // Savepoint keeps the read-only transaction usable after a failed query.
    await client.query("SAVEPOINT driftly_cat");
    try {
      await fn();
      await client.query("RELEASE SAVEPOINT driftly_cat");
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT driftly_cat").catch(() => {});
      for (const c of categories) incomplete.add(c);
      errors.push({
        side,
        stage: "inspect",
        scope: categories.join(", "),
        message: redact(err instanceof Error ? err.message : String(err)),
        code: (err as { code?: string }).code,
      });
    }
  }

  if (want.has("columns")) {
    await safely(["columns"], async () => {
      const res = await client.query(COLUMNS_SQL, [schemas]);
      for (const r of res.rows) {
        const t = get(r.schema, r.table);
        if (!t) continue;
        t.columns[r.name] = {
          name: r.name,
          position: r.position,
          type: normalizeType(r.type),
          nullable: r.nullable,
          default: normalizeDefault(r.default, r.schema),
          identity: r.identity ?? "",
          generated: r.generated ?? "",
        };
      }
    });
  }

  const conCats = (["primaryKeys", "foreignKeys", "uniques"] as ObjectCategory[]).filter((c) => want.has(c));
  if (conCats.length) {
    await safely(conCats, async () => {
      const res = await client.query(versionNum >= 150000 ? CONSTRAINTS_SQL : CONSTRAINTS_SQL_LEGACY, [schemas]);
      for (const r of res.rows) {
        const t = get(r.schema, r.table);
        if (!t) continue;
        if (r.type === "p" && want.has("primaryKeys")) {
          t.primaryKey = { name: r.name, columns: r.columns };
        } else if (r.type === "u" && want.has("uniques")) {
          t.uniques[r.name] = { name: r.name, columns: r.columns, nullsNotDistinct: r.nulls_not_distinct };
        } else if (r.type === "f" && want.has("foreignKeys")) {
          t.foreignKeys[r.name] = {
            name: r.name,
            columns: r.columns,
            refSchema: r.ref_schema,
            refTable: r.ref_table,
            refColumns: r.ref_columns,
            onUpdate: FK_ACTIONS[r.on_update] ?? r.on_update,
            onDelete: FK_ACTIONS[r.on_delete] ?? r.on_delete,
            match: FK_MATCH[r.match] ?? r.match,
            deferrable: r.deferrable,
            initiallyDeferred: r.deferred,
          };
        }
      }
    });
  }

  if (want.has("indexes")) {
    await safely(["indexes"], async () => {
      const res = await client.query(INDEXES_SQL, [schemas]);
      for (const r of res.rows) {
        const t = get(r.schema, r.table);
        if (!t) continue;
        t.indexes[r.name] = { name: r.name, unique: r.unique, definition: normalizeIndexDefinition(r.def, r.schema) };
      }
    });
  }

  return {
    capturedAt: new Date().toISOString(),
    serverVersion: meta.rows[0].version,
    database: meta.rows[0].db,
    schemas: ns.rows.map((r) => r.name).sort(),
    tables,
    incomplete: [...incomplete],
  };
}
