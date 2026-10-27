// Client-safe helpers for presenting differences. No server imports here.
import type { ColumnDef, DiffKind, ForeignKeyDef, IndexDef, ObjectKind, PrimaryKeyDef, Severity, UniqueDef } from "@/engine/types";

export const KIND_LABEL: Record<DiffKind, string> = { missing: "Missing", extra: "Extra", modified: "Modified" };
export const KIND_SYMBOL: Record<DiffKind, string> = { missing: "−", extra: "+", modified: "~" };
export const SEVERITY_LABEL: Record<Severity, string> = { breaking: "Potentially breaking", warning: "Warning", info: "Info" };
export const OBJECT_LABEL: Record<ObjectKind, string> = {
  schema: "Schema",
  table: "Table",
  column: "Column",
  primary_key: "Primary key",
  foreign_key: "Foreign key",
  unique: "Unique",
  index: "Index",
};
export const FIELD_LABEL: Record<string, string> = {
  type: "Type",
  nullable: "Nullable",
  default: "Default",
  identity: "Identity",
  generated: "Generated",
  columns: "Columns",
  refSchema: "Referenced schema",
  refTable: "Referenced table",
  refColumns: "Referenced columns",
  onUpdate: "On update",
  onDelete: "On delete",
  match: "Match",
  deferrable: "Deferrable",
  initiallyDeferred: "Initially deferred",
  nullsNotDistinct: "Nulls not distinct",
  unique: "Unique",
  definition: "Definition",
  name: "Name",
};

const list = (c: string[]) => c.join(", ");

export function formatValue(field: string, v: unknown): string {
  if (v == null || v === "") return field === "default" ? "(no default)" : "(none)";
  if (field === "nullable") return v ? "NULL allowed" : "NOT NULL";
  if (field === "identity") return v === "a" ? "ALWAYS" : v === "d" ? "BY DEFAULT" : "(none)";
  if (field === "generated") return v === "s" ? "STORED" : "(none)";
  if (Array.isArray(v)) return `(${list(v)})`;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

/** Turns a stored definition into readable, SQL-like lines. */
export function formatDefinition(kind: ObjectKind, def: unknown): string[] {
  if (def == null) return [];
  const d = def as Record<string, unknown>;
  switch (kind) {
    case "schema":
      return [`SCHEMA ${d.name}`];
    case "table": {
      const lines = ((d.columns as string[]) ?? []).map((c) => `  ${c}`);
      const pk = d.primaryKey as string[] | null;
      if (pk) lines.push(`  PRIMARY KEY (${list(pk)})`);
      const extra: string[] = [];
      if (d.foreignKeys) extra.push(`${d.foreignKeys} foreign key(s)`);
      if (d.indexes) extra.push(`${d.indexes} index(es)`);
      return ["(", ...lines, ")", ...(extra.length ? [`-- plus ${extra.join(", ")}`] : [])];
    }
    case "column": {
      const c = d as unknown as ColumnDef;
      const parts = [c.name, c.type, c.nullable ? "NULL" : "NOT NULL"];
      if (c.default) parts.push(`DEFAULT ${c.default}`);
      if (c.identity) parts.push(`GENERATED ${c.identity === "a" ? "ALWAYS" : "BY DEFAULT"} AS IDENTITY`);
      if (c.generated === "s") parts.push("GENERATED ALWAYS AS (…) STORED");
      return [parts.join(" ")];
    }
    case "primary_key": {
      const p = d as unknown as PrimaryKeyDef;
      return [`CONSTRAINT ${p.name}`, `  PRIMARY KEY (${list(p.columns)})`];
    }
    case "foreign_key": {
      const f = d as unknown as ForeignKeyDef;
      const lines = [
        `CONSTRAINT ${f.name}`,
        `  FOREIGN KEY (${list(f.columns)})`,
        `  REFERENCES ${f.refSchema}.${f.refTable} (${list(f.refColumns)})`,
        `  ON DELETE ${f.onDelete} ON UPDATE ${f.onUpdate}`,
      ];
      if (f.match && f.match !== "SIMPLE") lines.push(`  MATCH ${f.match}`);
      if (f.deferrable) lines.push(`  DEFERRABLE${f.initiallyDeferred ? " INITIALLY DEFERRED" : ""}`);
      return lines;
    }
    case "unique": {
      const u = d as unknown as UniqueDef;
      return [`CONSTRAINT ${u.name}`, `  UNIQUE${u.nullsNotDistinct ? " NULLS NOT DISTINCT" : ""} (${list(u.columns)})`];
    }
    case "index": {
      const i = d as unknown as IndexDef;
      return [`${i.unique ? "UNIQUE " : ""}INDEX ${i.name}`, `  ${i.definition}`];
    }
  }
}

export function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
