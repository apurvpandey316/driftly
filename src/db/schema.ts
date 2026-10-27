// Driftly's own database (the app's data — NOT the databases being inspected).
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const providerEnum = pgEnum("provider", ["postgresql", "supabase"]);
export const environmentEnum = pgEnum("environment", ["development", "staging", "production", "custom"]);
export const scanStatusEnum = pgEnum("scan_status", ["queued", "running", "completed", "partial", "failed"]);
export const diffKindEnum = pgEnum("diff_kind", ["missing", "extra", "modified"]);
export const severityEnum = pgEnum("severity", ["info", "warning", "breaking"]);
export const reviewStatusEnum = pgEnum("review_status", ["open", "acknowledged"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull(), // auth user id
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const connections = pgTable("connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  provider: providerEnum("provider").notNull(),
  environment: environmentEnum("environment").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(5432),
  database: text("database").notNull(),
  username: text("username").notNull(),
  // AES-256-GCM ciphertext (see src/lib/crypto.ts). Never sent to the browser.
  passwordEncrypted: text("password_encrypted").notNull(),
  sslMode: text("ssl_mode").notNull().default("require"),
  includedSchemas: text("included_schemas").array().notNull().default(["public"]),
  disabled: boolean("disabled").notNull().default(false),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  lastTestOk: boolean("last_test_ok"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per comparison run. Immutable once completed.
export const scans = pgTable("scans", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  referenceConnectionId: uuid("reference_connection_id").notNull().references(() => connections.id),
  targetConnectionId: uuid("target_connection_id").notNull().references(() => connections.id),
  // Names as they were when the scan ran, so reopened results read the same even after renames.
  referenceName: text("reference_name").notNull().default(""),
  referenceEnvironment: text("reference_environment").notNull().default("custom"),
  targetName: text("target_name").notNull().default(""),
  targetEnvironment: text("target_environment").notNull().default("custom"),
  // Frozen copy of the scope (schemas, exclusions, object categories) used for this run
  scope: jsonb("scope").notNull(),
  status: scanStatusEnum("status").notNull().default("queued"),
  // Normalized metadata snapshots, so results can be reopened exactly as they were
  referenceSnapshot: jsonb("reference_snapshot"),
  targetSnapshot: jsonb("target_snapshot"),
  // Permission / read errors. Any entry here means the scan cannot claim full parity.
  errors: jsonb("errors").notNull().default([]),
  warnings: jsonb("warnings").notNull().default([]),
  // ScanSummary from the engine (counts by kind and severity, inParity)
  summary: jsonb("summary"),
  missingCount: integer("missing_count").notNull().default(0),
  extraCount: integer("extra_count").notNull().default(0),
  modifiedCount: integer("modified_count").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const differences = pgTable("differences", {
  id: uuid("id").primaryKey().defaultRandom(),
  scanId: uuid("scan_id").notNull().references(() => scans.id, { onDelete: "cascade" }),
  // Stable id from the engine (kind:path:difference), used to track a difference across scans
  diffKey: text("diff_key").notNull().default(""),
  schemaName: text("schema_name").notNull().default(""),
  tableName: text("table_name"),
  objectPath: text("object_path").notNull(), // e.g. public.users.phone_number
  objectKind: text("object_kind").notNull(), // schema | table | column | primary_key | foreign_key | unique | index
  kind: diffKindEnum("kind").notNull(),
  severity: severityEnum("severity").notNull().default("info"),
  expected: jsonb("expected"), // reference definition (null if extra)
  actual: jsonb("actual"), // target definition (null if missing)
  changes: jsonb("changes").notNull().default([]), // which fields differ, for "modified"
  note: text("note"),
  suggestedAction: text("suggested_action"),
});

// Acknowledgements are an append-only log keyed by pair + stable difference key,
// so a review carries across scans. The latest row per key is the current state.
// Acknowledging never changes scan results or parity.
export const acknowledgements = pgTable("acknowledgements", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  referenceConnectionId: uuid("reference_connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
  targetConnectionId: uuid("target_connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
  diffKey: text("diff_key").notNull(),
  status: reviewStatusEnum("status").notNull(),
  note: text("note"),
  // Scan the action was taken from, for the audit trail.
  scanId: uuid("scan_id").references(() => scans.id, { onDelete: "set null" }),
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Earlier per-scan review table; superseded by acknowledgements above. Unused.
export const reviewActions = pgTable("review_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  differenceId: uuid("difference_id").notNull().references(() => differences.id, { onDelete: "cascade" }),
  status: reviewStatusEnum("status").notNull(),
  comment: text("comment"),
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
