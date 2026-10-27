"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { acknowledgements, connections, differences, scans } from "@/db/schema";
import { ALL_CATEGORIES, runScan, type ObjectCategory } from "@/engine";
import { getEngineConfig } from "@/lib/connections";
import { saveScan } from "@/lib/scans";
import { getWorkspaceId } from "@/lib/workspace";

export interface ComparisonInput {
  referenceId: string;
  targetId: string;
  schemas: string[];
  excludeTables: string;
  categories: string[];
}

export type RunResult = { ok: true; id: string } | { ok: false; error: string };

export async function runComparison(input: ComparisonInput): Promise<RunResult> {
  if (!input.referenceId || !input.targetId) return { ok: false, error: "Choose both a reference and a target." };
  if (input.referenceId === input.targetId)
    return { ok: false, error: "Reference and target must be different connections." };

  const schemas = [...new Set(input.schemas.map((s) => s.trim()).filter(Boolean))];
  if (!schemas.length) return { ok: false, error: "Select at least one schema." };
  const categories = input.categories.filter((c): c is ObjectCategory => ALL_CATEGORIES.includes(c as ObjectCategory));
  const excludeTables = input.excludeTables
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const workspaceId = await getWorkspaceId();
  const rows = await db
    .select({ id: connections.id, name: connections.name, environment: connections.environment, disabled: connections.disabled })
    .from(connections)
    .where(and(eq(connections.workspaceId, workspaceId), inArray(connections.id, [input.referenceId, input.targetId])));
  const ref = rows.find((r) => r.id === input.referenceId);
  const tgt = rows.find((r) => r.id === input.targetId);
  if (!ref || !tgt) return { ok: false, error: "One of the connections no longer exists." };
  if (ref.disabled || tgt.disabled) return { ok: false, error: "Disabled connections can't be scanned. Enable them first." };

  const [refCfg, tgtCfg] = await Promise.all([getEngineConfig(ref.id), getEngineConfig(tgt.id)]);
  if (!refCfg || !tgtCfg) return { ok: false, error: "Could not load connection details." };

  // Failed and partial scans are saved too: they are part of the history.
  const result = await runScan({
    reference: refCfg.config,
    target: tgtCfg.config,
    scope: { schemas, excludeTables, categories: categories.length ? categories : ALL_CATEGORIES },
  });
  const id = await saveScan(result, ref, tgt);
  revalidatePath("/comparisons");
  revalidatePath("/dashboard");
  return { ok: true, id };
}

/**
 * Records that a difference was reviewed (or reopens it). Append-only: the
 * history of review actions is kept. It never changes scan results or parity.
 */
export async function setAcknowledgement(
  scanId: string,
  diffKey: string,
  acknowledged: boolean,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const workspaceId = await getWorkspaceId();
  const [scan] = await db
    .select({ ref: scans.referenceConnectionId, tgt: scans.targetConnectionId })
    .from(scans)
    .where(and(eq(scans.id, scanId), eq(scans.workspaceId, workspaceId)));
  if (!scan) return { ok: false, error: "Comparison not found." };
  const [exists] = await db
    .select({ id: differences.id })
    .from(differences)
    .where(and(eq(differences.scanId, scanId), eq(differences.diffKey, diffKey)))
    .limit(1);
  if (!exists) return { ok: false, error: "That difference is not part of this comparison." };

  await db.insert(acknowledgements).values({
    workspaceId,
    referenceConnectionId: scan.ref,
    targetConnectionId: scan.tgt,
    diffKey,
    status: acknowledged ? "acknowledged" : "open",
    note: note?.trim().slice(0, 500) || null,
    scanId,
    actorId: "local",
  });
  revalidatePath(`/comparisons/${scanId}`);
  revalidatePath("/history");
  return { ok: true };
}
