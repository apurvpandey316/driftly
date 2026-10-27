import { PageHeader, EmptyState } from "@/components/page-header";
import { LinkButton } from "@/components/button";
import { Card } from "@/components/ui";
import type { ScanStatus } from "@/engine/types";
import { getHistory } from "@/lib/history";
import { listPairs } from "@/lib/scans";
import { HistoryList } from "./history-list";

export const dynamic = "force-dynamic";

const RANGES = { "7d": 7, "30d": 30, "90d": 90 } as const;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ pair?: string; range?: string; from?: string; to?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const range = sp.range && (sp.range in RANGES || sp.range === "all" || sp.range === "custom") ? sp.range : "30d";
  const status = (["completed", "partial", "failed"] as const).includes(sp.status as ScanStatus) ? (sp.status as ScanStatus) : undefined;

  let from: Date | undefined;
  let to: Date | undefined;
  if (range in RANGES) from = new Date(Date.now() - RANGES[range as keyof typeof RANGES] * 86_400_000);
  if (range === "custom") {
    if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) from = new Date(`${sp.from}T00:00:00`);
    if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) to = new Date(`${sp.to}T23:59:59.999`);
  }

  const [pairs, entries] = await Promise.all([listPairs(), getHistory({ pair: sp.pair, from, to, status })]);

  const control =
    "h-9 rounded-md border border-border bg-bg px-3 text-sm text-text focus:border-accent focus:outline-none";

  return (
    <>
      <PageHeader
        title="Drift History"
        description="Every scan run, and what changed since the previous run of the same pair. Saved runs never change."
      />
      {pairs.length === 0 ? (
        <EmptyState
          title="No scan history yet"
          body="Run a comparison. Each run is recorded here, and later runs show what was introduced or resolved."
          action={<LinkButton href="/comparisons/new">New Comparison</LinkButton>}
        />
      ) : (
        <div className="grid gap-4 p-8">
          <Card className="p-4">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs text-muted">
                Environment pair
                <select name="pair" defaultValue={sp.pair ?? ""} className={control}>
                  <option value="">All pairs</option>
                  {pairs.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted">
                Period
                <select name="range" defaultValue={range} className={control}>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="all">All time</option>
                  <option value="custom">Custom dates</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted">
                From (custom)
                <input type="date" name="from" defaultValue={sp.from ?? ""} className={control} />
              </label>
              <label className="grid gap-1 text-xs text-muted">
                To (custom)
                <input type="date" name="to" defaultValue={sp.to ?? ""} className={control} />
              </label>
              <label className="grid gap-1 text-xs text-muted">
                Result
                <select name="status" defaultValue={status ?? ""} className={control}>
                  <option value="">All results</option>
                  <option value="completed">Completed</option>
                  <option value="partial">Partial</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
              <button type="submit" className="h-9 rounded-md bg-accent px-3 text-sm font-medium text-bg hover:bg-accent/90">
                Apply
              </button>
            </form>
          </Card>

          <HistoryList entries={entries} />
        </div>
      )}
    </>
  );
}
