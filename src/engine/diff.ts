import { signature } from "./normalize";
import type {
  ColumnDef,
  Difference,
  DiffKind,
  FieldChange,
  ForeignKeyDef,
  IndexDef,
  ObjectCategory,
  ObjectKind,
  PrimaryKeyDef,
  ScanScope,
  Severity,
  Snapshot,
  TableDef,
  UniqueDef,
} from "./types";

// Direction matters: the reference is the expected definition, the target is
// what was found. "Missing" = in reference, not in target. "Extra" = the reverse.

const RANK: Record<Severity, number> = { info: 0, warning: 1, breaking: 2 };
const maxSeverity = (list: Severity[]): Severity =>
  list.reduce<Severity>((m, s) => (RANK[s] > RANK[m] ? s : m), "info");

const q = (name: string) => (/^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`);
const cols = (c: string[]) => c.map(q).join(", ");

function make(
  d: Omit<Difference, "id" | "changes"> & { changes?: FieldChange[] },
): Difference {
  return { ...d, changes: d.changes ?? [], id: `${d.objectKind}:${d.path}:${d.kind}` };
}

/** Pairs named objects by name, then pairs leftovers whose definitions are identical. */
function matchNamed<T extends { name: string }>(
  ref: Record<string, T>,
  tgt: Record<string, T>,
  sig: (x: T) => string,
) {
  const both: [T, T][] = [];
  const renamed: [T, T][] = [];
  let missing = Object.values(ref).filter((r) => !(r.name in tgt));
  let extra = Object.values(tgt).filter((t) => !(t.name in ref));
  for (const r of Object.values(ref)) if (r.name in tgt) both.push([r, tgt[r.name]]);

  for (const r of [...missing]) {
    const t = extra.find((e) => sig(e) === sig(r));
    if (t) {
      renamed.push([r, t]);
      missing = missing.filter((m) => m !== r);
      extra = extra.filter((e) => e !== t);
    }
  }
  return { both, renamed, missing, extra };
}

function fieldChanges<T extends object>(a: T, b: T, fields: (keyof T)[]): FieldChange[] {
  return fields
    .filter((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]))
    .map((f) => ({ field: String(f), expected: a[f], actual: b[f] }));
}

// ---------- columns ----------

function columnDiffs(ref: TableDef, tgt: TableDef): Difference[] {
  const out: Difference[] = [];
  const base = (name: string) => ({
    path: `${ref.schema}.${ref.name}.${name}`,
    schema: ref.schema,
    table: ref.name,
    objectKind: "column" as ObjectKind,
  });
  const extraCols = Object.values(tgt.columns).filter((c) => !(c.name in ref.columns));

  for (const r of Object.values(ref.columns)) {
    const t = tgt.columns[r.name];
    if (!t) {
      const lookalike = extraCols.find((e) => e.type === r.type);
      out.push(
        make({
          ...base(r.name),
          kind: "missing",
          severity: "breaking",
          expected: r,
          actual: null,
          note:
            `Column exists in reference as ${r.type}${r.nullable ? "" : " NOT NULL"} but was not found in target. ` +
            `Queries that read or write it will fail against target.` +
            (lookalike
              ? ` Target has an extra column "${lookalike.name}" of the same type; this may be a rename, but it is not assumed.`
              : ""),
          suggestedAction: `Add column ${q(r.name)} ${r.type}${r.nullable ? "" : " NOT NULL"}${
            r.default ? ` DEFAULT ${r.default}` : ""
          } to ${ref.schema}.${q(ref.name)} in target, or remove its usage from the application.`,
        }),
      );
      continue;
    }

    const changes = fieldChanges<ColumnDef>(r, t, ["type", "nullable", "default", "identity", "generated"]);
    if (!changes.length) continue;

    const severities: Severity[] = [];
    const notes: string[] = [];
    const actions: string[] = [];
    for (const c of changes) {
      switch (c.field) {
        case "type":
          severities.push("warning");
          notes.push(`Type differs: expected ${r.type}, actual ${t.type}.`);
          actions.push(`Align the type (ALTER COLUMN ... TYPE ${r.type}) after checking existing data fits.`);
          break;
        case "nullable":
          if (r.nullable && !t.nullable) {
            severities.push("breaking");
            notes.push("Target is NOT NULL but reference allows NULL: writes that omit or null this column will fail in target.");
            actions.push("Drop the NOT NULL constraint in target, or make the application always provide a value.");
          } else {
            severities.push("warning");
            notes.push("Reference is NOT NULL but target allows NULL: target may already contain NULLs the application does not expect.");
            actions.push("Backfill NULLs in target, then SET NOT NULL.");
          }
          break;
        case "default":
          severities.push(r.default && !t.default && !t.nullable ? "warning" : "info");
          notes.push(`Default differs: expected ${r.default ?? "none"}, actual ${t.default ?? "none"}.`);
          actions.push(r.default ? `SET DEFAULT ${r.default} in target.` : "Drop the default in target.");
          break;
        case "identity":
        case "generated":
          severities.push("warning");
          notes.push(`${c.field === "identity" ? "Identity" : "Generated"} setting differs.`);
          actions.push(`Align the ${c.field} definition.`);
          break;
      }
    }
    out.push(
      make({
        ...base(r.name),
        kind: "modified",
        severity: maxSeverity(severities),
        expected: r,
        actual: t,
        changes,
        note: notes.join(" "),
        suggestedAction: actions.join(" "),
      }),
    );
  }

  for (const t of extraCols) {
    const requiredOnInsert = !t.nullable && t.default == null && !t.identity && !t.generated;
    out.push(
      make({
        ...base(t.name),
        kind: "extra",
        severity: requiredOnInsert ? "breaking" : "info",
        expected: null,
        actual: t,
        note: requiredOnInsert
          ? "Column exists only in target and is NOT NULL without a default: inserts written against the reference schema will fail."
          : "Column exists only in target.",
        suggestedAction: `Add it to the reference definition if intended, or drop ${q(t.name)} from target after confirming it is unused.`,
      }),
    );
  }
  return out;
}

// ---------- constraints & indexes ----------

const fkSig = (f: ForeignKeyDef) =>
  signature([f.columns, f.refSchema, f.refTable, f.refColumns, f.onUpdate, f.onDelete, f.match, f.deferrable, f.initiallyDeferred]);
const uqSig = (u: UniqueDef) => signature([u.columns, u.nullsNotDistinct]);
const ixSig = (i: IndexDef) => signature([i.unique, i.definition]);

interface NamedSpec<T extends { name: string }> {
  kind: ObjectKind;
  label: string;
  sig: (x: T) => string;
  fields: (keyof T)[];
  describe: (x: T) => string;
  severity: { missing: (x: T) => Severity; extra: (x: T) => Severity; modified: (r: T, t: T) => Severity };
  impact: { missing: string; extra: string };
}

function namedDiffs<T extends { name: string }>(
  ref: TableDef,
  tgtMap: Record<string, T>,
  refMap: Record<string, T>,
  spec: NamedSpec<T>,
): Difference[] {
  const out: Difference[] = [];
  const at = (name: string) => ({
    path: `${ref.schema}.${ref.name}.${name}`,
    schema: ref.schema,
    table: ref.name,
    objectKind: spec.kind,
  });
  const m = matchNamed(refMap, tgtMap, spec.sig);

  for (const r of m.missing)
    out.push(
      make({
        ...at(r.name),
        kind: "missing",
        severity: spec.severity.missing(r),
        expected: r,
        actual: null,
        note: `${spec.label} ${spec.describe(r)} is not present in target. ${spec.impact.missing}`,
        suggestedAction: `Create the ${spec.label.toLowerCase()} in target after checking existing data satisfies it.`,
      }),
    );
  for (const t of m.extra)
    out.push(
      make({
        ...at(t.name),
        kind: "extra",
        severity: spec.severity.extra(t),
        expected: null,
        actual: t,
        note: `${spec.label} ${spec.describe(t)} exists only in target. ${spec.impact.extra}`,
        suggestedAction: `Add it to the reference if intended, otherwise review whether to drop it from target.`,
      }),
    );
  for (const [r, t] of m.both) {
    const changes = fieldChanges(r, t, spec.fields);
    if (!changes.length) continue;
    out.push(
      make({
        ...at(r.name),
        kind: "modified",
        severity: spec.severity.modified(r, t),
        expected: r,
        actual: t,
        changes,
        note: `${spec.label} definition differs: expected ${spec.describe(r)}, actual ${spec.describe(t)}.`,
        suggestedAction: `Recreate the ${spec.label.toLowerCase()} in target to match the reference.`,
      }),
    );
  }
  for (const [r, t] of m.renamed)
    out.push(
      make({
        ...at(r.name),
        kind: "modified",
        severity: "info",
        expected: r,
        actual: t,
        changes: [{ field: "name", expected: r.name, actual: t.name }],
        note: `Same definition, different name ("${t.name}" in target). Behaviour is identical; migrations that reference it by name may fail.`,
        suggestedAction: `Optionally rename "${t.name}" to "${r.name}" in target.`,
      }),
    );
  return out;
}

function primaryKeyDiffs(ref: TableDef, tgt: TableDef): Difference[] {
  const r = ref.primaryKey;
  const t = tgt.primaryKey;
  const at = (p: PrimaryKeyDef) => ({
    path: `${ref.schema}.${ref.name}.${p.name}`,
    schema: ref.schema,
    table: ref.name,
    objectKind: "primary_key" as ObjectKind,
  });
  if (r && !t)
    return [
      make({
        ...at(r),
        kind: "missing",
        severity: "warning",
        expected: r,
        actual: null,
        note: `Primary key (${cols(r.columns)}) is missing in target: duplicate rows are possible and tools that need a key (replication, ORMs) may fail.`,
        suggestedAction: `Add PRIMARY KEY (${cols(r.columns)}) in target after removing duplicates.`,
      }),
    ];
  if (!r && t)
    return [
      make({
        ...at(t),
        kind: "extra",
        severity: "info",
        expected: null,
        actual: t,
        note: `Target has a primary key (${cols(t.columns)}) the reference does not define.`,
        suggestedAction: "Add the primary key to the reference if intended.",
      }),
    ];
  if (r && t) {
    const changes = fieldChanges(r, t, ["columns", "name"]);
    if (!changes.length) return [];
    const onlyName = changes.every((c) => c.field === "name");
    return [
      make({
        ...at(r),
        kind: "modified",
        severity: onlyName ? "info" : "warning",
        expected: r,
        actual: t,
        changes,
        note: onlyName
          ? `Same primary key columns, different constraint name ("${t.name}" in target).`
          : `Primary key columns differ: expected (${cols(r.columns)}), actual (${cols(t.columns)}).`,
        suggestedAction: onlyName ? `Optionally rename the constraint in target.` : "Recreate the primary key in target to match the reference.",
      }),
    ];
  }
  return [];
}

/** Readable summary of a whole table, used when the table exists on one side only. */
function tableSummary(t: TableDef) {
  return {
    columns: Object.values(t.columns)
      .sort((a, b) => a.position - b.position)
      .map((c) => `${c.name} ${c.type}${c.nullable ? "" : " NOT NULL"}${c.default ? ` DEFAULT ${c.default}` : ""}`),
    primaryKey: t.primaryKey ? t.primaryKey.columns : null,
    foreignKeys: Object.keys(t.foreignKeys).length,
    indexes: Object.keys(t.indexes).length,
  };
}

// ---------- entry point ----------

function skip(cat: ObjectCategory, scope: Required<ScanScope>, ref: Snapshot, tgt: Snapshot) {
  return !scope.categories.includes(cat) || ref.incomplete.includes(cat) || tgt.incomplete.includes(cat);
}

export function diffSnapshots(ref: Snapshot, tgt: Snapshot, scope: Required<ScanScope>): Difference[] {
  const out: Difference[] = [];
  const comparableSchemas: string[] = [];

  for (const s of scope.schemas) {
    const inRef = ref.schemas.includes(s);
    const inTgt = tgt.schemas.includes(s);
    const base = { path: s, schema: s, table: null, objectKind: "schema" as ObjectKind };
    if (inRef && inTgt) comparableSchemas.push(s);
    else if (inRef)
      out.push(
        make({
          ...base,
          kind: "missing",
          severity: "breaking",
          expected: { name: s },
          actual: null,
          note: `Schema "${s}" exists in reference but not in target. Its tables were not compared individually.`,
          suggestedAction: `Create schema ${q(s)} and its objects in target.`,
        }),
      );
    else if (inTgt)
      out.push(
        make({
          ...base,
          kind: "extra",
          severity: "info",
          expected: null,
          actual: { name: s },
          note: `Schema "${s}" exists only in target.`,
          suggestedAction: "Review whether this schema belongs in the reference definition.",
        }),
      );
  }

  const inScope = (key: string) => comparableSchemas.includes(key.slice(0, key.indexOf(".")));
  const refKeys = Object.keys(ref.tables).filter(inScope);
  const tgtKeys = Object.keys(tgt.tables).filter(inScope);

  for (const key of refKeys) {
    const r = ref.tables[key];
    const t = tgt.tables[key];
    const base = { path: key, schema: r.schema, table: r.name, objectKind: "table" as ObjectKind };
    if (!t) {
      out.push(
        make({
          ...base,
          kind: "missing",
          severity: "breaking",
          expected: tableSummary(r),
          actual: null,
          note: `Table ${key} exists in reference but was not found in target. Any query using it will fail.`,
          suggestedAction: `Create ${key} in target using the reference definition.`,
        }),
      );
      continue;
    }
    if (!skip("columns", scope, ref, tgt)) out.push(...columnDiffs(r, t));
    if (!skip("primaryKeys", scope, ref, tgt)) out.push(...primaryKeyDiffs(r, t));
    if (!skip("foreignKeys", scope, ref, tgt))
      out.push(
        ...namedDiffs<ForeignKeyDef>(r, t.foreignKeys, r.foreignKeys, {
          kind: "foreign_key",
          label: "Foreign key",
          sig: fkSig,
          fields: ["columns", "refSchema", "refTable", "refColumns", "onUpdate", "onDelete", "match", "deferrable", "initiallyDeferred"],
          describe: (f) =>
            `(${cols(f.columns)}) → ${f.refSchema}.${f.refTable}(${cols(f.refColumns)}) ON DELETE ${f.onDelete} ON UPDATE ${f.onUpdate}`,
          severity: { missing: () => "warning", extra: () => "warning", modified: () => "warning" },
          impact: {
            missing: "Referential integrity is not enforced in target.",
            extra: "Target may reject writes the reference accepts.",
          },
        }),
      );
    if (!skip("uniques", scope, ref, tgt))
      out.push(
        ...namedDiffs<UniqueDef>(r, t.uniques, r.uniques, {
          kind: "unique",
          label: "Unique constraint",
          sig: uqSig,
          fields: ["columns", "nullsNotDistinct"],
          describe: (u) => `(${cols(u.columns)})`,
          severity: { missing: () => "warning", extra: () => "warning", modified: () => "warning" },
          impact: {
            missing: "Duplicates can be inserted in target.",
            extra: "Target may reject inserts the reference accepts.",
          },
        }),
      );
    if (!skip("indexes", scope, ref, tgt))
      out.push(
        ...namedDiffs<IndexDef>(r, t.indexes, r.indexes, {
          kind: "index",
          label: "Index",
          sig: ixSig,
          fields: ["unique", "definition"],
          describe: (i) => `${i.unique ? "UNIQUE " : ""}${i.definition}`,
          severity: {
            missing: (i) => (i.unique ? "warning" : "info"),
            extra: (i) => (i.unique ? "warning" : "info"),
            modified: (a, b) => (a.unique !== b.unique ? "warning" : "info"),
          },
          impact: {
            missing: "Queries relying on it may be slower in target.",
            extra: "Usually harmless; adds write overhead.",
          },
        }),
      );
  }

  for (const key of tgtKeys) {
    if (ref.tables[key]) continue;
    const t = tgt.tables[key];
    out.push(
      make({
        path: key,
        schema: t.schema,
        table: t.name,
        objectKind: "table",
        kind: "extra",
        severity: "info",
        expected: null,
        actual: tableSummary(t),
        note: `Table ${key} exists only in target.`,
        suggestedAction: "Add it to the reference definition if intended, or review whether it can be dropped.",
      }),
    );
  }

  // Deterministic order: by path, then kind
  const order: Record<DiffKind, number> = { missing: 0, extra: 1, modified: 2 };
  return out.sort((a, b) => a.path.localeCompare(b.path) || order[a.kind] - order[b.kind]);
}
