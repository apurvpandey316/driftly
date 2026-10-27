import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, lte, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { differences, scans } from "@/db/schema";
import type {
  Difference,
  DiffKind,
  FieldChange,
  ObjectCategory,
  ObjectKind,
  RunData,
  ScanError,
  ScanResult,
  ScanScope,
  ScanStatus,
  ScanSummary,
  Severity,
  Snapshot,
} from "@/engine";
import { summarize } from "@/engine";
import { getWorkspaceId } from "./workspace";

export interface ScanSide {
  id: string;
  name: string;
  environment: string;
}

/** Everything the results page needs. Snapshots are left out (they can be large). */
export interface SavedScan {
  id: string;
  status: ScanStatus;
  reference: ScanSide;
  target: ScanSide;
  scope: Required<ScanScope>;
  startedAt: string | null;
  finishedAt: string | null;
  errors: ScanError[];
  warnings: string[];
  summary: ScanSummary;
  /** Categories that couldn't be read on either side. */
  incomplete: ObjectCategory[];
  differences: Difference[];
}

export interface ScanListItem {
  id: string;
  status: ScanStatus;
  reference: ScanSide;
  target: ScanSide;
  finishedAt: string | null;
  summary: ScanSummary;
  scope: Required<ScanScope>;
  incomplete: ObjectCategory[];
}

export interface ScanFilters {
  /** "referenceId:targetId" */
  pair?: string;
  from?: Date;
  to?: Date;
  status?: ScanStatus;
  limit?: number;
}

const emptySummary = (status: ScanStatus): ScanSummary => summarize(status, []);

export async function saveScan(
  result: ScanResult,
  reference: ScanSide,
  target: ScanSide,
): Promise<string> {
  const workspaceId = await getWorkspaceId();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(scans)
      .values({
        workspaceId,
        referenceConnectionId: reference.id,
        targetConnectionId: target.id,
        referenceName: reference.name,
        referenceEnvironment: reference.environment,
        targetName: target.name,
        targetEnvironment: target.environment,
        scope: result.scope,
        status: result.status,
        referenceSnapshot: result.reference,
        targetSnapshot: result.target,
        errors: result.errors,
        warnings: result.warnings,
        summary: result.summary,
        missingCount: result.summary.missing,
        extraCount: result.summary.extra,
        modifiedCount: result.summary.modified,
        startedAt: new Date(result.startedAt),
        finishedAt: new Date(result.finishedAt),
      })
      .returning({ id: scans.id });

    // Insert in chunks to stay well under the parameter limit on big schemas.
    for (let i = 0; i < result.differences.length; i += 500) {
      await tx.insert(differences).values(
        result.differences.slice(i, i + 500).map((d) => ({
          scanId: row.id,
          diffKey: d.id,
          schemaName: d.schema,
          tableName: d.table,
          objectPath: d.path,
          objectKind: d.objectKind,
          kind: d.kind,
          severity: d.severity,
          expected: d.expected,
          actual: d.actual,
          changes: d.changes,
          note: d.note,
          suggestedAction: d.suggestedAction,
        })),
      );
    }
    return row.id;
  });
}

// Light column set for lists: never load the (possibly large) snapshots.
const listColumns = {
  id: scans.id,
  status: scans.status,
  referenceConnectionId: scans.referenceConnectionId,
  referenceName: scans.referenceName,
  referenceEnvironment: scans.referenceEnvironment,
  targetConnectionId: scans.targetConnectionId,
  targetName: scans.targetName,
  targetEnvironment: scans.targetEnvironment,
  finishedAt: scans.finishedAt,
  createdAt: scans.createdAt,
  summary: scans.summary,
  scope: scans.scope,
  incomplete: sql<ObjectCategory[]>`(
    select coalesce(jsonb_agg(distinct c), '[]'::jsonb) from (
      select jsonb_array_elements_text(coalesce(${scans.referenceSnapshot}->'incomplete', '[]'::jsonb)) as c
      union all
      select jsonb_array_elements_text(coalesce(${scans.targetSnapshot}->'incomplete', '[]'::jsonb))
    ) x)`,
};

type SideRow = Pick<
  typeof scans.$inferSelect,
  "referenceConnectionId" | "referenceName" | "referenceEnvironment" | "targetConnectionId" | "targetName" | "targetEnvironment"
>;

function sides(r: SideRow) {
  return {
    reference: { id: r.referenceConnectionId, name: r.referenceName, environment: r.referenceEnvironment },
    target: { id: r.targetConnectionId, name: r.targetName, environment: r.targetEnvironment },
  };
}

export async function listScans(filters: ScanFilters | number = {}): Promise<ScanListItem[]> {
  const f: ScanFilters = typeof filters === "number" ? { limit: filters } : filters;
  const workspaceId = await getWorkspaceId();
  const where: SQL[] = [eq(scans.workspaceId, workspaceId)];
  if (f.pair) {
    const [ref, tgt] = f.pair.split(":");
    if (/^[0-9a-f-]{36}$/i.test(ref ?? "") && /^[0-9a-f-]{36}$/i.test(tgt ?? "")) {
      where.push(eq(scans.referenceConnectionId, ref), eq(scans.targetConnectionId, tgt));
    }
  }
  if (f.from) where.push(gte(scans.createdAt, f.from));
  if (f.to) where.push(lte(scans.createdAt, f.to));
  if (f.status) where.push(eq(scans.status, f.status));

  const rows = await db
    .select(listColumns)
    .from(scans)
    .where(and(...where))
    .orderBy(desc(scans.createdAt))
    .limit(f.limit ?? 50);
  return rows.map((r) => ({
    id: r.id,
    status: r.status as ScanStatus,
    ...sides(r),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    summary: (r.summary as ScanSummary | null) ?? emptySummary(r.status as ScanStatus),
    scope: r.scope as Required<ScanScope>,
    incomplete: r.incomplete ?? [],
  }));
}

/** Distinct reference → target pairs that have at least one scan. */
export async function listPairs(): Promise<{ key: string; label: string }[]> {
  const items = await listScans(500);
  const seen = new Map<string, string>();
  for (const s of items) {
    const key = `${s.reference.id}:${s.target.id}`;
    if (!seen.has(key)) seen.set(key, `${s.reference.name} → ${s.target.name}`);
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}

/** Most recent non-failed run of the same pair before the given scan. */
export async function getPreviousRunId(scanId: string): Promise<string | null> {
  const [cur] = await db
    .select({ ref: scans.referenceConnectionId, tgt: scans.targetConnectionId, createdAt: scans.createdAt, ws: scans.workspaceId })
    .from(scans)
    .where(eq(scans.id, scanId));
  if (!cur) return null;
  const [prev] = await db
    .select({ id: scans.id })
    .from(scans)
    .where(
      and(
        eq(scans.workspaceId, cur.ws),
        eq(scans.referenceConnectionId, cur.ref),
        eq(scans.targetConnectionId, cur.tgt),
        lt(scans.createdAt, cur.createdAt),
        ne(scans.status, "failed"),
      ),
    )
    .orderBy(desc(scans.createdAt))
    .limit(1);
  return prev?.id ?? null;
}

/**
 * Data needed by the history classifier, for many scans at once.
 * withDefinitions adds expected/actual so definition changes can be detected.
 */
export async function getRunData(items: ScanListItem[], withDefinitions = false): Promise<Map<string, RunData>> {
  const out = new Map<string, RunData>();
  for (const s of items) out.set(s.id, { status: s.status, scope: s.scope, incomplete: s.incomplete, differences: [] });
  const ids = items.filter((s) => s.status !== "failed").map((s) => s.id);
  if (!ids.length) return out;
  const rows = await db
    .select({
      scanId: differences.scanId,
      id: differences.diffKey,
      path: differences.objectPath,
      schema: differences.schemaName,
      table: differences.tableName,
      objectKind: differences.objectKind,
      kind: differences.kind,
      severity: differences.severity,
      ...(withDefinitions ? { expected: differences.expected, actual: differences.actual } : {}),
    })
    .from(differences)
    .where(inArray(differences.scanId, ids));
  for (const r of rows) {
    const { scanId, ...d } = r as typeof r & { expected?: unknown; actual?: unknown };
    out.get(scanId)!.differences.push({ ...d, objectKind: d.objectKind as ObjectKind, kind: d.kind as DiffKind, severity: d.severity as Severity });
  }
  return out;
}

export async function getScanListItem(id: string): Promise<ScanListItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const workspaceId = await getWorkspaceId();
  const [r] = await db
    .select(listColumns)
    .from(scans)
    .where(and(eq(scans.id, id), eq(scans.workspaceId, workspaceId)));
  if (!r) return null;
  return {
    id: r.id,
    status: r.status as ScanStatus,
    ...sides(r),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    summary: (r.summary as ScanSummary | null) ?? emptySummary(r.status as ScanStatus),
    scope: r.scope as Required<ScanScope>,
    incomplete: r.incomplete ?? [],
  };
}

async function loadRow(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const workspaceId = await getWorkspaceId();
  const [row] = await db
    .select()
    .from(scans)
    .where(and(eq(scans.id, id), eq(scans.workspaceId, workspaceId)));
  return row ?? null;
}

async function loadDifferences(scanId: string): Promise<Difference[]> {
  const rows = await db
    .select()
    .from(differences)
    .where(eq(differences.scanId, scanId))
    .orderBy(asc(differences.objectPath));
  return rows.map((d) => ({
    id: d.diffKey,
    path: d.objectPath,
    schema: d.schemaName,
    table: d.tableName,
    objectKind: d.objectKind as ObjectKind,
    kind: d.kind as DiffKind,
    severity: d.severity as Severity,
    expected: d.expected,
    actual: d.actual,
    changes: (d.changes as FieldChange[]) ?? [],
    note: d.note ?? "",
    suggestedAction: d.suggestedAction ?? "",
  }));
}

export async function getScan(id: string): Promise<SavedScan | null> {
  const row = await loadRow(id);
  if (!row) return null;
  return {
    id: row.id,
    status: row.status as ScanStatus,
    ...sides(row),
    scope: row.scope as Required<ScanScope>,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    errors: row.errors as ScanError[],
    warnings: row.warnings as string[],
    summary: (row.summary as ScanSummary | null) ?? emptySummary(row.status as ScanStatus),
    incomplete: [
      ...new Set([
        ...(((row.referenceSnapshot as Snapshot | null)?.incomplete ?? []) as ObjectCategory[]),
        ...(((row.targetSnapshot as Snapshot | null)?.incomplete ?? []) as ObjectCategory[]),
      ]),
    ],
    differences: await loadDifferences(row.id),
  };
}

/** Full engine result (with snapshots), for JSON/CSV export. */
export async function getScanResult(id: string): Promise<{ result: ScanResult; scan: ReturnType<typeof sides> } | null> {
  const row = await loadRow(id);
  if (!row) return null;
  const status = row.status as ScanStatus;
  return {
    scan: sides(row),
    result: {
      status,
      scope: row.scope as Required<ScanScope>,
      startedAt: row.startedAt?.toISOString() ?? "",
      finishedAt: row.finishedAt?.toISOString() ?? "",
      reference: row.referenceSnapshot as Snapshot | null,
      target: row.targetSnapshot as Snapshot | null,
      errors: row.errors as ScanError[],
      warnings: row.warnings as string[],
      differences: await loadDifferences(row.id),
      summary: (row.summary as ScanSummary | null) ?? emptySummary(status),
    },
  };
}
