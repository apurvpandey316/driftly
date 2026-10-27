// Classifies how differences changed between two runs of the same
// reference → target pair. Pure and deterministic; no database access.
//
// The key rule (from the spec): a difference only counts as RESOLVED when the
// later run actually checked that object and didn't find it. If it vanished
// because of an exclusion, a narrower scope, an unreadable category, a failed
// run, or because it is now covered by a table/schema-level difference, it is
// "unverified", never "resolved".

import type { DiffKind, ObjectCategory, ObjectKind, ScanScope, ScanStatus, Severity } from "./types";

export interface RunDiff {
  id: string; // stable key: objectKind:path:kind
  path: string;
  schema: string;
  table: string | null;
  objectKind: ObjectKind;
  kind: DiffKind;
  severity: Severity;
  /** Optional, used to detect definition changes in persistent differences. */
  expected?: unknown;
  actual?: unknown;
}

export interface RunData {
  status: ScanStatus;
  scope: Required<ScanScope>;
  /** Categories that couldn't be read on either side in this run. */
  incomplete: ObjectCategory[];
  differences: RunDiff[];
}

export type UnverifiedReason = "failed" | "schema-out-of-scope" | "table-excluded" | "category-not-compared" | "category-unreadable" | "covered-by-parent";

export const UNVERIFIED_LABEL: Record<UnverifiedReason, string> = {
  failed: "the later run failed",
  "schema-out-of-scope": "its schema was not in the later run's scope",
  "table-excluded": "its table was excluded from the later run",
  "category-not-compared": "this object type was not compared in the later run",
  "category-unreadable": "this object type could not be read in the later run",
  "covered-by-parent": "it is now part of a whole missing/extra table or schema",
};

export interface RunComparison {
  /** In the later run only. notCheckedBefore: the earlier run couldn't have seen it, so it may not be truly new. */
  introduced: { diff: RunDiff; notCheckedBefore: UnverifiedReason | null }[];
  persistent: { diff: RunDiff; definitionChanged: boolean }[];
  resolved: RunDiff[];
  unverified: { diff: RunDiff; reason: UnverifiedReason }[];
  scopeChanges: string[];
}

const CATEGORY_OF: Partial<Record<ObjectKind, ObjectCategory>> = {
  column: "columns",
  primary_key: "primaryKeys",
  foreign_key: "foreignKeys",
  unique: "uniques",
  index: "indexes",
};

function excluded(scope: Required<ScanScope>, schema: string, table: string | null) {
  if (!table) return false;
  return scope.excludeTables.some((t) => t === `${schema}.${table}` || t === table);
}

/** Why a later run could not have seen this difference, or null if it was fully checked. */
export function coverageGap(d: RunDiff, later: RunData): UnverifiedReason | null {
  if (later.status === "failed") return "failed";
  if (!later.scope.schemas.includes(d.schema)) return "schema-out-of-scope";
  if (excluded(later.scope, d.schema, d.table)) return "table-excluded";
  const cat = CATEGORY_OF[d.objectKind];
  if (cat && !later.scope.categories.includes(cat)) return "category-not-compared";
  if (cat && later.incomplete.includes(cat)) return "category-unreadable";
  // A column diff disappears when its whole table becomes missing/extra: not a fix.
  const parentHit = later.differences.some(
    (p) =>
      (p.objectKind === "schema" && p.schema === d.schema && d.objectKind !== "schema") ||
      (p.objectKind === "table" && d.table && p.schema === d.schema && p.table === d.table && d.objectKind !== "table"),
  );
  if (parentHit) return "covered-by-parent";
  return null;
}

function describeScope(s: Required<ScanScope>) {
  return {
    schemas: [...s.schemas].sort().join(", "),
    categories: [...s.categories].sort().join(", "),
    excludes: [...s.excludeTables].sort().join(", ") || "none",
  };
}

export function scopeChanges(earlier: Required<ScanScope>, later: Required<ScanScope>): string[] {
  const a = describeScope(earlier);
  const b = describeScope(later);
  const out: string[] = [];
  if (a.schemas !== b.schemas) out.push(`Schemas changed: ${a.schemas} → ${b.schemas}`);
  if (a.categories !== b.categories) out.push(`Object types changed: ${a.categories} → ${b.categories}`);
  if (a.excludes !== b.excludes) out.push(`Excluded tables changed: ${a.excludes} → ${b.excludes}`);
  return out;
}

export function compareRuns(earlier: RunData, later: RunData): RunComparison {
  const before = new Map(earlier.differences.map((d) => [d.id, d]));
  const after = new Map(later.differences.map((d) => [d.id, d]));

  const introduced: RunComparison["introduced"] = [];
  const persistent: RunComparison["persistent"] = [];
  const resolved: RunDiff[] = [];
  const unverified: RunComparison["unverified"] = [];

  // Symmetric rule for "new": if the earlier run could not have seen the object,
  // the difference is flagged as not checked before rather than confidently new.
  for (const d of later.differences) {
    const prev = before.get(d.id);
    if (prev) {
      const changed =
        d.expected !== undefined &&
        (JSON.stringify(prev.expected) !== JSON.stringify(d.expected) || JSON.stringify(prev.actual) !== JSON.stringify(d.actual));
      persistent.push({ diff: d, definitionChanged: changed });
    } else {
      introduced.push({ diff: d, notCheckedBefore: coverageGap(d, earlier) });
    }
  }

  for (const d of earlier.differences) {
    if (after.has(d.id)) continue;
    const gap = coverageGap(d, later);
    if (gap) unverified.push({ diff: d, reason: gap });
    else resolved.push(d);
  }

  return { introduced, persistent, resolved, unverified, scopeChanges: scopeChanges(earlier.scope, later.scope) };
}
