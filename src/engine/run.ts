import type { Client } from "pg";
import { closeQuietly, openReadOnly, redact } from "./connect";
import { diffSnapshots } from "./diff";
import { inspect } from "./inspect";
import {
  ALL_CATEGORIES,
  type ConnectionConfig,
  type Difference,
  type ScanError,
  type ScanResult,
  type ScanScope,
  type ScanStatus,
  type ScanSummary,
  type Side,
  type Snapshot,
} from "./types";

export function resolveScope(scope: ScanScope): Required<ScanScope> {
  const schemas = [...new Set(scope.schemas.map((s) => s.trim()).filter(Boolean))];
  if (!schemas.length) throw new Error("Scope must include at least one schema.");
  return {
    schemas,
    excludeTables: scope.excludeTables ?? [],
    categories: scope.categories?.length ? scope.categories : ALL_CATEGORIES,
  };
}

async function capture(
  side: Side,
  config: ConnectionConfig,
  scope: Required<ScanScope>,
  errors: ScanError[],
): Promise<Snapshot | null> {
  let client: Client | null = null;
  try {
    client = await openReadOnly(config);
  } catch (err) {
    errors.push({ side, stage: "connect", message: redact(err instanceof Error ? err.message : String(err)), code: (err as { code?: string }).code });
    return null;
  }
  try {
    return await inspect(client, side, scope, errors);
  } catch (err) {
    errors.push({ side, stage: "inspect", message: redact(err instanceof Error ? err.message : String(err)), code: (err as { code?: string }).code });
    return null;
  } finally {
    await closeQuietly(client);
  }
}

/**
 * Reads one database's normalized metadata (used by the Schema Explorer).
 * Never throws for database problems: they come back as errors.
 */
export async function captureSnapshot(
  config: ConnectionConfig,
  scope: ScanScope,
): Promise<{ snapshot: Snapshot | null; errors: ScanError[] }> {
  const errors: ScanError[] = [];
  const snapshot = await capture("target", config, resolveScope(scope), errors);
  return { snapshot, errors };
}

export function summarize(status: ScanStatus, differences: Difference[]): ScanSummary {
  const bySeverity = { info: 0, warning: 0, breaking: 0 };
  let missing = 0, extra = 0, modified = 0;
  for (const d of differences) {
    bySeverity[d.severity]++;
    if (d.kind === "missing") missing++;
    else if (d.kind === "extra") extra++;
    else modified++;
  }
  // Parity can only be claimed by a scan that read everything it was asked to.
  return { missing, extra, modified, bySeverity, inParity: status === "completed" && differences.length === 0 };
}

/**
 * Runs a full comparison. Never throws for database problems: they are
 * returned as errors with status "failed" or "partial".
 */
export async function runScan(input: {
  reference: ConnectionConfig;
  target: ConnectionConfig;
  scope: ScanScope;
}): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const scope = resolveScope(input.scope);
  const errors: ScanError[] = [];

  const [reference, target] = await Promise.all([
    capture("reference", input.reference, scope, errors),
    capture("target", input.target, scope, errors),
  ]);

  let status: ScanStatus;
  let differences: Difference[] = [];
  const warnings: string[] = [];
  if (!reference || !target) {
    status = "failed";
  } else {
    differences = diffSnapshots(reference, target, scope);
    for (const s of scope.schemas) {
      if (!reference.schemas.includes(s) && !target.schemas.includes(s))
        warnings.push(`Schema "${s}" was not found in either database, so nothing in it was compared.`);
    }
    const incomplete = reference.incomplete.length > 0 || target.incomplete.length > 0;
    status = incomplete || errors.length > 0 ? "partial" : "completed";
  }

  return {
    status,
    scope,
    startedAt,
    finishedAt: new Date().toISOString(),
    reference,
    target,
    errors,
    warnings,
    differences,
    summary: summarize(status, differences),
  };
}
