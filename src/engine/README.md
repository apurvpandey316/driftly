# Comparison engine

Standalone TypeScript with no Next.js imports, so it runs from the web app, the CLI
(`scripts/compare.ts`), or a future background worker / self-hosted scanner agent.

| File | Role |
|---|---|
| `types.ts` | Snapshot, difference and result types (plain JSON, stored as-is) |
| `connect.ts` | Read-only connections, `testConnection`, secret redaction, vendor schemas |
| `inspect.ts` | `pg_catalog` queries → normalized snapshot; records per-category read failures |
| `normalize.ts` | Makes equivalent definitions compare equal |
| `diff.ts` | Reference vs target → Missing / Extra / Modified, plus severity, notes and suggested actions |
| `run.ts` | `runScan()`: orchestrates both sides, decides completed / partial / failed |
| `export.ts` | JSON and CSV export |

## Safety and accuracy rules (from the spec)
- Every connection runs inside `BEGIN TRANSACTION READ ONLY` with a statement timeout.
- Only catalog metadata is read, never table rows.
- If a category can't be read on either side, it is marked `incomplete` and **skipped** by the diff,
  so a read failure is never reported as a missing object. The scan becomes `partial`.
- `summary.inParity` is true only for a `completed` scan with zero differences.
- Renames are never assumed for tables or columns. Constraints and indexes with identical
  definitions but different names are reported as an informational "name differs".
- Indexes that back primary keys and unique constraints are compared as those constraints, not twice.
- Difference ids (`kind:path:difference`) are stable across scans, for history tracking in Phase 2.
