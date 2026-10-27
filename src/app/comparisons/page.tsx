import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { LinkButton } from "@/components/button";
import { ScanStatusPill } from "@/components/scan-status";
import { Card, EnvBadge } from "@/components/ui";
import { listScans } from "@/lib/scans";

export const dynamic = "force-dynamic";

export default async function ComparisonsPage() {
  const items = await listScans();
  const action = (
    <LinkButton href="/comparisons/new">
      <Plus size={16} aria-hidden /> New Comparison
    </LinkButton>
  );

  return (
    <>
      <PageHeader title="Comparisons" description="Saved scans. Each one keeps its original results." action={action} />
      {items.length === 0 ? (
        <EmptyState title="No comparisons yet" body="Run your first comparison to see its results here." action={action} />
      ) : (
        <div className="p-8">
          <Card>
            <ul className="divide-y divide-border">
              {items.map((s) => (
                <li key={s.id}>
                  <Link href={`/comparisons/${s.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 hover:bg-surface-2">
                    <span className="flex min-w-64 flex-1 items-center gap-2 text-sm">
                      <span className="font-medium">{s.reference.name}</span>
                      <EnvBadge environment={s.reference.environment} />
                      <ArrowRight size={14} className="text-muted" aria-label="to" />
                      <span className="font-medium">{s.target.name}</span>
                      <EnvBadge environment={s.target.environment} />
                    </span>
                    <span className="w-56 text-xs tabular-nums text-muted">
                      {s.status === "failed" ? "—" : `${s.summary.missing} missing · ${s.summary.extra} extra · ${s.summary.modified} modified`}
                    </span>
                    <ScanStatusPill status={s.status} summary={s.summary} className="w-56" />
                    <time className="w-40 text-right text-xs text-muted" dateTime={s.finishedAt ?? undefined}>
                      {s.finishedAt ? new Date(s.finishedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
