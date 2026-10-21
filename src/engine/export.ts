import type { ScanResult } from "./types";

/** Full result, including snapshots, as pretty JSON. */
export function toJSON(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

const cell = (v: unknown): string => {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per difference. */
export function toCSV(result: ScanResult): string {
  const header = ["path", "object_kind", "difference", "severity", "changed_fields", "expected", "actual", "note", "suggested_action"];
  const rows = result.differences.map((d) => [
    d.path,
    d.objectKind,
    d.kind,
    d.severity,
    d.changes.map((c) => c.field).join("; "),
    d.expected,
    d.actual,
    d.note,
    d.suggestedAction,
  ]);
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
