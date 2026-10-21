// Normalization: make semantically equivalent definitions compare equal,
// so the diff reports real differences only.
//
// PostgreSQL already canonicalizes a lot for us (format_type, pg_get_indexdef,
// pg_get_expr), e.g. "USING btree (owner_id ASC)" and "(owner_id)" both come
// back as "USING btree (owner_id)". These helpers handle what's left.

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** format_type() output is canonical; just tidy whitespace. */
export function normalizeType(type: string): string {
  return collapse(type);
}

/**
 * Column defaults. Strips the table's own schema from sequence references so
 * nextval('public.users_id_seq'::regclass) == nextval('users_id_seq'::regclass).
 */
export function normalizeDefault(expr: string | null, schema: string): string | null {
  if (expr == null) return null;
  let out = collapse(expr);
  out = out.split(`'${schema}.`).join("'");
  out = out.split(`'"${schema}".`).join("'");
  return out;
}

/**
 * pg_get_indexdef returns "CREATE [UNIQUE] INDEX name ON [ONLY] schema.table USING method (...) [WHERE ...]".
 * Keep only the part from USING onward: the name and table are compared separately.
 */
export function normalizeIndexDefinition(def: string, schema: string): string {
  const i = def.indexOf(" USING ");
  let out = collapse(i >= 0 ? def.slice(i + 1) : def);
  out = out.split(` ${schema}.`).join(" ").split(`(${schema}.`).join("(");
  return out;
}

/** Stable key for comparing two definitions while ignoring their names. */
export function signature(parts: unknown[]): string {
  return JSON.stringify(parts);
}
