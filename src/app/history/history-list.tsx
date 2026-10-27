"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, GitCompare } from "lucide-react";
import type { HistoryEntry } from "@/lib/history";
import { ScanStatusPill } from "@/components/scan-status";
import { Card, EnvBadge } from "@/components/ui";
import { cn } from "@/lib/utils";

function dayLabel(iso: string | null) {
  if (!iso) return "Unknown date";
  return new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function ChangeChips({ e }: { e: HistoryEntry }) {
  const c = e.change;
  if (!c) return <span className="text-xs text-muted">No data from this run. Nothing counted as resolved.</span>;
  if (!c.previousId) return <span className="text-xs text-muted">First successful run for this pair</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <span className={c.introduced ? "text-accent" : "text-muted"}>+{c.introduced} new</span>
      <span className={c.resolved ? "text-ok" : "text-muted"}>−{c.resolved} resolved</span>
      <span className="text-muted">{c.persistent} persistent</span>
      {c.unverified > 0 && <span className="text-missing">{c.unverified} not checked in both runs</span>}
      {c.scopeChanged && <span className="text-missing">scope changed</span>}
    </span>
  );
}

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  const [picked, setPicked] = useState<string[]>([]);

  const groups = useMemo(() => {
    const m = new Map<string, HistoryEntry[]>();
    for (const e of entries) {
      const d = dayLabel(e.scan.finishedAt);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(e);
    }
    return [...m.entries()];
  }, [entries]);

  const pickedEntries = picked.map((id) => entries.find((e) => e.scan.id === id)!).filter(Boolean);
  const samePair =
    pickedEntries.length === 2 &&
    pickedEntries[0].scan.reference.id === pickedEntries[1].scan.reference.id &&
    pickedEntries[0].scan.target.id === pickedEntries[1].scan.target.id;

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));

  if (!entries.length) return <Card className="p-8 text-center text-sm text-muted">No runs match these filters.</Card>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted">
          {entries.length} run{entries.length === 1 ? "" : "s"} · tick two runs of the same pair to compare them
        </span>
        {samePair ? (
          <Link
            href={`/history/compare?from=${picked[0]}&to=${picked[1]}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:bg-accent/90"
          >
            <GitCompare size={14} aria-hidden /> Compare selected runs
          </Link>
        ) : pickedEntries.length === 2 ? (
          <span className="text-xs text-missing">Pick two runs of the same reference → target pair.</span>
        ) : null}
      </div>

      {groups.map(([day, items]) => (
        <section key={day} aria-label={day}>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{day}</h2>
          <Card>
            <ol className="divide-y divide-border">
              {items.map((e) => {
                const s = e.scan;
                const checked = picked.includes(s.id);
                return (
                  <li key={s.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3", checked && "bg-surface-2/60")}>
                    <input
                      type="checkbox"
                      aria-label={`Select run ${s.reference.name} to ${s.target.name} at ${s.finishedAt ?? ""}`}
                      className="accent-[var(--accent)]"
                      checked={checked}
                      onChange={() => toggle(s.id)}
                    />
                    <time className="w-16 whitespace-nowrap text-xs tabular-nums text-muted" dateTime={s.finishedAt ?? undefined}>
                      {s.finishedAt ? new Date(s.finishedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                    </time>
                    <span className="flex min-w-60 flex-1 flex-wrap items-center gap-1.5 text-sm">
                      <span className="font-medium">{s.reference.name}</span>
                      <EnvBadge environment={s.reference.environment} />
                      <ArrowRight size={12} className="text-muted" aria-label="to" />
                      <span className="font-medium">{s.target.name}</span>
                      <EnvBadge environment={s.target.environment} />
                      <span className="ml-1 font-mono text-[11px] text-muted">{s.scope.schemas.join(", ")}</span>
                    </span>
                    <span className="w-60">
                      <ScanStatusPill status={s.status} summary={s.summary} />
                    </span>
                    <span className="w-72">
                      <ChangeChips e={e} />
                    </span>
                    <span className="flex gap-3 text-xs">
                      {e.change?.previousId && (
                        <Link href={`/history/compare?from=${e.change.previousId}&to=${s.id}`} className="text-muted hover:text-text">
                          vs previous
                        </Link>
                      )}
                      <Link href={`/comparisons/${s.id}`} className="text-accent hover:underline">
                        Open
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
        </section>
      ))}
    </div>
  );
}
