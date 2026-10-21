// Core types for the Driftly comparison engine.
// Everything here is plain JSON-serializable data so snapshots and results
// can be stored as-is and reopened later exactly as they were.

export type Side = "reference" | "target";

/** Object categories a scan can include. Schemas and tables are always compared. */
export type ObjectCategory = "columns" | "primaryKeys" | "foreignKeys" | "uniques" | "indexes";
export const ALL_CATEGORIES: ObjectCategory[] = ["columns", "primaryKeys", "foreignKeys", "uniques", "indexes"];

export type ObjectKind = "schema" | "table" | "column" | "primary_key" | "foreign_key" | "unique" | "index";
export type DiffKind = "missing" | "extra" | "modified";
export type Severity = "info" | "warning" | "breaking";

// ---------- Connection + scope ----------

export interface ConnectionConfig {
  /** Either a full URL... */
  connectionString?: string;
  /** ...or discrete fields. */
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  sslMode?: "disable" | "require" | "verify-full";
  /** Milliseconds. Defaults: connect 10s, each query 30s. */
  connectTimeoutMs?: number;
  queryTimeoutMs?: number;
}

export interface ScanScope {
  /** Schemas to compare, e.g. ["public"]. */
  schemas: string[];
  /** Tables to skip: "schema.table" or just "table" (any schema). */
  excludeTables?: string[];
  /** Which object categories to compare. Defaults to all. */
  categories?: ObjectCategory[];
}

// ---------- Snapshot (normalized metadata for one database) ----------

export interface ColumnDef {
  name: string;
  position: number;
  /** Canonical PostgreSQL type, e.g. "character varying(255)". */
  type: string;
  nullable: boolean;
  default: string | null;
  /** "" | "a" (always) | "d" (by default) */
  identity: string;
  /** "" | "s" (stored generated column) */
  generated: string;
}

export interface PrimaryKeyDef {
  name: string;
  columns: string[];
}

export interface ForeignKeyDef {
  name: string;
  columns: string[];
  refSchema: string;
  refTable: string;
  refColumns: string[];
  onUpdate: string;
  onDelete: string;
  match: string;
  deferrable: boolean;
  initiallyDeferred: boolean;
}

export interface UniqueDef {
  name: string;
  columns: string[];
  nullsNotDistinct: boolean;
}

export interface IndexDef {
  name: string;
  unique: boolean;
  /** Canonical definition without name/table, e.g. "USING btree (lower((email)::text))". */
  definition: string;
}

export interface TableDef {
  schema: string;
  name: string;
  columns: Record<string, ColumnDef>;
  primaryKey: PrimaryKeyDef | null;
  foreignKeys: Record<string, ForeignKeyDef>;
  uniques: Record<string, UniqueDef>;
  /** Standalone indexes only. Indexes backing PK/unique constraints are covered by those. */
  indexes: Record<string, IndexDef>;
}

export interface Snapshot {
  capturedAt: string;
  serverVersion: string;
  database: string;
  /** Requested schemas that actually exist in this database. */
  schemas: string[];
  /** Keyed by "schema.table". */
  tables: Record<string, TableDef>;
  /**
   * Categories that could NOT be read completely. The diff skips these so a
   * read failure is never mistaken for an object being absent.
   */
  incomplete: ObjectCategory[];
}

// ---------- Results ----------

export interface ScanError {
  side: Side;
  stage: "connect" | "inspect" | "privileges";
  /** Category or object the error applies to, if narrower than the whole side. */
  scope?: string;
  message: string;
  code?: string;
}

export interface FieldChange {
  field: string;
  expected: unknown;
  actual: unknown;
}

export interface Difference {
  /** Stable across scans: same object + same kind of difference => same id. */
  id: string;
  /** Schema-qualified path, e.g. "public.users.phone_number". */
  path: string;
  schema: string;
  table: string | null;
  objectKind: ObjectKind;
  kind: DiffKind;
  severity: Severity;
  /** Reference definition (null when extra). */
  expected: unknown;
  /** Target definition (null when missing). */
  actual: unknown;
  /** For "modified": which fields differ. */
  changes: FieldChange[];
  note: string;
  /** Advisory only. Never executed. */
  suggestedAction: string;
}

export type ScanStatus = "completed" | "partial" | "failed";

export interface ScanSummary {
  missing: number;
  extra: number;
  modified: number;
  bySeverity: Record<Severity, number>;
  /** True only for a completed scan with zero differences. */
  inParity: boolean;
}

export interface ScanResult {
  status: ScanStatus;
  scope: Required<ScanScope>;
  startedAt: string;
  finishedAt: string;
  reference: Snapshot | null;
  target: Snapshot | null;
  errors: ScanError[];
  /** Non-fatal notices, e.g. a requested schema exists in neither database. */
  warnings: string[];
  differences: Difference[];
  summary: ScanSummary;
}
