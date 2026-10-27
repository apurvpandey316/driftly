import "server-only";
import type { ScanStatus } from "@/engine";
import { listConnections } from "./connections";
import { listScans, type ScanListItem } from "./scans";

export interface ChartPoint {
  id: string;
  pair: string;
  finishedAt: string | null;
  total: number;
  status: ScanStatus;
  inParity: boolean;
}

export interface Overview {
  connections: { total: number; disabled: number };
  /** Distinct reference → target pairs that have been scanned at least once. */
  pairs: { total: number; healthy: number; failing: number; partial: number };
  /** Sum of differences in the latest non-failed scan of each pair. */
  activeDifferences: number;
  breaking: number;
  lastScan: ScanListItem | null;
  chart: ChartPoint[];
  recent: ScanListItem[];
}

// Everything here comes from completed scans. Nothing is assumed to be live.
export async function getOverview(): Promise<Overview> {
  const [conns, scans] = await Promise.all([listConnections(), listScans(100)]);

  const latestByPair = new Map<string, ScanListItem>();
  for (const s of scans) {
    const key = `${s.reference.id}->${s.target.id}`;
    if (!latestByPair.has(key)) latestByPair.set(key, s); // scans are newest first
  }
  const latest = [...latestByPair.values()];
  const counted = latest.filter((s) => s.status !== "failed");

  return {
    connections: { total: conns.length, disabled: conns.filter((c) => c.disabled).length },
    pairs: {
      total: latest.length,
      healthy: latest.filter((s) => s.status === "completed" && s.summary.inParity).length,
      failing: latest.filter((s) => s.status === "failed").length,
      partial: latest.filter((s) => s.status === "partial").length,
    },
    activeDifferences: counted.reduce((n, s) => n + s.summary.missing + s.summary.extra + s.summary.modified, 0),
    breaking: counted.reduce((n, s) => n + s.summary.bySeverity.breaking, 0),
    lastScan: scans[0] ?? null,
    chart: scans
      .slice(0, 7)
      .reverse()
      .map((s) => ({
        id: s.id,
        pair: `${s.reference.name} → ${s.target.name}`,
        finishedAt: s.finishedAt,
        total: s.summary.missing + s.summary.extra + s.summary.modified,
        status: s.status,
        inParity: s.summary.inParity,
      })),
    recent: scans.slice(0, 5),
  };
}
