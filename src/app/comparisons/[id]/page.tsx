import { notFound } from "next/navigation";
import { compareRuns } from "@/engine";
import { getAcks } from "@/lib/acks";
import { getPreviousRunId, getRunData, getScan, getScanListItem } from "@/lib/scans";
import { ResultsView, type SincePrevious } from "./results-view";

export const dynamic = "force-dynamic";

export default async function ComparisonResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) notFound();

  const acks = await getAcks(scan.reference.id, scan.target.id);

  // How this run differs from the previous non-failed run of the same pair.
  let sincePrevious: SincePrevious | null = null;
  if (scan.status !== "failed") {
    const prevId = await getPreviousRunId(scan.id);
    if (prevId) {
      const [prev, cur] = await Promise.all([getScanListItem(prevId), getScanListItem(scan.id)]);
      if (prev && cur) {
        const runs = await getRunData([prev, cur]);
        const c = compareRuns(runs.get(prev.id)!, runs.get(cur.id)!);
        sincePrevious = {
          previousId: prev.id,
          previousFinishedAt: prev.finishedAt,
          introducedKeys: c.introduced.filter((x) => !x.notCheckedBefore).map((x) => x.diff.id),
          resolved: c.resolved.length,
          unverified: c.unverified.length + c.introduced.filter((x) => x.notCheckedBefore).length,
          persistent: c.persistent.length,
          scopeChanged: c.scopeChanges.length > 0,
        };
      }
    }
  }

  return <ResultsView scan={scan} acks={acks} sincePrevious={sincePrevious} />;
}
