import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Plus, XCircle } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { LinkButton } from "@/components/button";
import { ScanStatusPill } from "@/components/scan-status";
import { Card, EnvBadge, timeAgo } from "@/components/ui";
import { getOverview } from "@/lib/overview";
import { ActivityChart } from "./activity-chart";

export const dynamic = "force-dynamic";

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export default async function DashboardPage() {
  const o = await getOverview();
  const newButton = (
    <LinkButton href="/comparisons/new">
      <Plus size={16} aria-hidden /> New Comparison
    </LinkButton>
  );

  if (o.connections.total === 0) {
    return (
      <>
        <PageHeader title="Overview" description="Health from your most recent completed scans." />
        <EmptyState
          title="Connect your first database"
          body="Add two databases, such as Development and Production, then run a comparison to see how they differ."
          action={<LinkButton href="/connections/new">Add connection</LinkButton>}
        />
      </>
    );
  }

  if (!o.lastScan) {
    return (
      <>
        <PageHeader title="Overview" description="Health from your most recent completed scans." action={newButton} />
        <EmptyState
          title="No scans yet"
          body={
            o.connections.total - o.connections.disabled >= 2
              ? "Run your first comparison to see differences between your environments."
              : "Add one more connection, then run your first comparison."
          }
          action={
            o.connections.total - o.connections.disabled >= 2 ? (
              newButton
            ) : (
              <LinkButton href="/connections/new">Add connection</LinkButton>
            )
          }
        />
      </>
    );
  }

  const last = o.lastScan;

  return (
    <>
      <PageHeader title="Overview" description="Health from your most recent completed scans, not a live view." action={newButton} />
      <div className="grid gap-6 p-8">
        {last.status !== "completed" && (
          <Card role="alert" className={`flex items-center gap-3 p-4 text-sm ${last.status === "failed" ? "border-danger/40" : "border-missing/40"}`}>
            {last.status === "failed" ? (
              <XCircle size={18} className="shrink-0 text-danger" aria-hidden />
            ) : (
              <AlertTriangle size={18} className="shrink-0 text-missing" aria-hidden />
            )}
            <span className="flex-1">
              The most recent scan ({last.reference.name} → {last.target.name}){" "}
              {last.status === "failed" ? "failed, so no comparison was made." : "was partial, so parity can't be confirmed."}
            </span>
            <Link href={`/comparisons/${last.id}`} className="text-accent hover:underline">
              View details
            </Link>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Connections"
            value={o.connections.total}
            sub={o.connections.disabled ? `${o.connections.disabled} disabled` : "all enabled"}
          />
          <Metric
            label="Active differences"
            value={o.activeDifferences}
            sub={
              o.breaking > 0 ? (
                <span className="text-danger">{o.breaking} potentially breaking</span>
              ) : (
                `latest scan of ${o.pairs.total} pair${o.pairs.total === 1 ? "" : "s"}`
              )
            }
          />
          <Metric
            label="Healthy pairs"
            value={
              <span>
                {o.pairs.healthy}
                <span className="text-base font-normal text-muted"> / {o.pairs.total}</span>
              </span>
            }
            sub={
              o.pairs.failing || o.pairs.partial
                ? [o.pairs.failing && `${o.pairs.failing} failed`, o.pairs.partial && `${o.pairs.partial} partial`].filter(Boolean).join(" · ")
                : "in parity on their latest scan"
            }
          />
          <Metric
            label="Most recent scan"
            value={timeAgo(last.finishedAt)}
            sub={<ScanStatusPill status={last.status} summary={last.summary} />}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Card className="p-5">
            <h2 className="text-sm font-medium">Differences found · latest {o.chart.length} scan{o.chart.length === 1 ? "" : "s"}</h2>
            <p className="mb-4 mt-0.5 text-xs text-muted">Across all environment pairs, one bar per scan.</p>
            <ActivityChart points={o.chart} />
          </Card>

          <Card className="flex flex-col">
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <h2 className="text-sm font-medium">Recent comparisons</h2>
              <Link href="/comparisons" className="text-xs text-muted hover:text-text">
                View all
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {o.recent.map((s) => (
                <li key={s.id}>
                  <Link href={`/comparisons/${s.id}`} className="grid gap-1 px-5 py-3 hover:bg-surface-2">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="font-medium">{s.reference.name}</span>
                      <EnvBadge environment={s.reference.environment} />
                      <ArrowRight size={12} className="text-muted" aria-label="to" />
                      <span className="font-medium">{s.target.name}</span>
                      <EnvBadge environment={s.target.environment} />
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <ScanStatusPill status={s.status} summary={s.summary} />
                      <span className="text-xs text-muted">{timeAgo(s.finishedAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {o.pairs.total > 0 && o.pairs.healthy === o.pairs.total && (
          <p className="flex items-center gap-2 text-sm text-ok">
            <CheckCircle2 size={16} aria-hidden /> Every scanned pair was in parity on its latest scan.
          </p>
        )}
      </div>
    </>
  );
}
