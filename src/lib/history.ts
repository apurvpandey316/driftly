import "server-only";
import { and, eq, inArray, min } from "drizzle-orm";
import { db } from "@/db";
import { differences, scans } from "@/db/schema";
import { compareRuns } from "@/engine";
import { getPreviousRunId, getRunData, getScanListItem, listScans, type ScanFilters, type ScanListItem } from "./scans";
import { getWorkspaceId } from "./workspace";

export interface RunChange {
  /** null for the first successful run of a pair (nothing to compare against). */
  previousId: string | null;
  introduced: number;
  resolved: number;
  persistent: number;
  unverified: number;
  scopeChanged: boolean;
}

export interface HistoryEntry {
  scan: ScanListItem;
  change: RunChange | null; // null for failed runs
}

const pairKey = (s: ScanListItem) => `${s.reference.id}:${s.target.id}`;

/**
 * Scan timeline with, for each successful run, what changed since the previous
 * successful run of the same pair. Failed runs are listed but never used as a baseline.
 */
export async function getHistory(filters: ScanFilters): Promise<HistoryEntry[]> {
  // Load the window without the status filter so baselines are always available.
  const { status, ...windowFilters } = filters;
  const all = await listScans({ ...windowFilters, limit: windowFilters.limit ?? 200 });

  // For each pair, also fetch the run just before the window as the first baseline.
  const oldestByPair = new Map<string, ScanListItem>();
  for (const s of all) if (s.status !== "failed") oldestByPair.set(pairKey(s), s); // newest-first list → last wins = oldest
  const baselines: ScanListItem[] = [];
  for (const s of oldestByPair.values()) {
    const prevId = await getPreviousRunId(s.id);
    if (prevId && !all.some((x) => x.id === prevId)) {
      const prev = await getScanListItem(prevId);
      if (prev) baselines.push(prev);
    }
  }

  const runs = await getRunData([...all, ...baselines]);
  const chronological = [...all, ...baselines].sort(
    (a, b) => new Date(a.finishedAt ?? 0).getTime() - new Date(b.finishedAt ?? 0).getTime(),
  );

  const lastGood = new Map<string, ScanListItem>();
  const changes = new Map<string, RunChange>();
  for (const s of chronological) {
    if (s.status === "failed") continue;
    const prev = lastGood.get(pairKey(s));
    if (prev) {
      const c = compareRuns(runs.get(prev.id)!, runs.get(s.id)!);
      changes.set(s.id, {
        previousId: prev.id,
        introduced: c.introduced.filter((x) => !x.notCheckedBefore).length,
        resolved: c.resolved.length,
        persistent: c.persistent.length,
        unverified: c.unverified.length + c.introduced.filter((x) => x.notCheckedBefore).length,
        scopeChanged: c.scopeChanges.length > 0,
      });
    } else {
      changes.set(s.id, { previousId: null, introduced: 0, resolved: 0, persistent: 0, unverified: 0, scopeChanged: false });
    }
    lastGood.set(pairKey(s), s);
  }

  return all
    .filter((s) => !status || s.status === status)
    .map((s) => ({ scan: s, change: s.status === "failed" ? null : (changes.get(s.id) ?? null) }));
}

/** Earliest scan (of this pair) in which each difference key was found. */
export async function firstDetected(referenceId: string, targetId: string, keys: string[]): Promise<Record<string, string>> {
  if (!keys.length) return {};
  const workspaceId = await getWorkspaceId();
  const rows = await db
    .select({ key: differences.diffKey, first: min(scans.createdAt) })
    .from(differences)
    .innerJoin(scans, eq(scans.id, differences.scanId))
    .where(
      and(
        eq(scans.workspaceId, workspaceId),
        eq(scans.referenceConnectionId, referenceId),
        eq(scans.targetConnectionId, targetId),
        inArray(differences.diffKey, keys),
      ),
    )
    .groupBy(differences.diffKey);
  return Object.fromEntries(rows.filter((r) => r.first).map((r) => [r.key, new Date(r.first!).toISOString()]));
}
