import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ScanStatusPill } from "@/components/scan-status";
import { Card, EnvBadge } from "@/components/ui";
import { compareRuns, UNVERIFIED_LABEL, type RunDiff } from "@/engine";
import { getAcks, type AckState } from "@/lib/acks";
import { KIND_LABEL, KIND_SYMBOL, OBJECT_LABEL, SEVERITY_LABEL } from "@/lib/format";
import { firstDetected } from "@/lib/history";
import { getRunData, getScanListItem, type ScanListItem } from "@/lib/scans";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KIND_TEXT = { missing: "text-missing", extra: "text-extra", modified: "text-modified" } as const;
const SEV_TEXT = { breaking: "text-danger", warning: "text-missing", info: "text-muted" } as const;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");

function RunCard({ label, s }: { label: string; s: ScanListItem }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <Link href={`/comparisons/${s.id}`} className="mt-1 block font-medium hover:underline">
        {fmt(s.finishedAt)}
      </Link>
      <div className="mt-1">
        <ScanStatusPill status={s.status} summary={s.summary} />
      </div>
      <div className="mt-1 text-xs text-muted">
        schemas <span className="font-mono">{s.scope.schemas.join(", ")}</span>
        {s.scope.excludeTables.length > 0 && (
          <>
            {" "}· excluding <span className="font-mono">{s.scope.excludeTables.join(", ")}</span>
          </>
        )}
      </div>
    </Card>
  );
}

function Row({ d, ack, extra }: { d: RunDiff; ack?: AckState; extra?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
      <span className={cn("inline-flex w-24 shrink-0 items-center gap-1.5 font-mono text-xs font-medium", KIND_TEXT[d.kind])}>
        <span aria-hidden>{KIND_SYMBOL[d.kind]}</span>
        {KIND_LABEL[d.kind]}
      </span>
      <span className="w-24 shrink-0 text-xs text-muted">{OBJECT_LABEL[d.objectKind]}</span>
      <span className="min-w-0 flex-1 truncate font-mono">{d.path}</span>
      {extra}
      {ack && (
        <span className="inline-flex items-center gap-1 text-[11px] text-ok">
          <CheckCircle2 size={11} aria-hidden /> Acknowledged
        </span>
      )}
      <span className={cn("text-xs", SEV_TEXT[d.severity])}>{d.severity === "breaking" ? "Potentially breaking" : SEVERITY_LABEL[d.severity]}</span>
    </li>
  );
}

function Section({ title, hint, count, tone, children }: { title: string; hint: string; count: number; tone: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-baseline gap-2 text-sm font-medium">
        <span className={tone}>{title}</span>
        <span className="text-muted">· {count}</span>
      </h2>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      {count === 0 ? (
        <Card className="px-4 py-3 text-sm text-muted">None</Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">{children}</ul>
        </Card>
      )}
    </section>
  );
}

export default async function CompareRunsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  if (!from || !to) notFound();
  const [a0, b0] = await Promise.all([getScanListItem(from), getScanListItem(to)]);
  if (!a0 || !b0) notFound();

  // Always compare earlier → later, whichever order they were picked in.
  const [a, b] = new Date(a0.finishedAt ?? 0) <= new Date(b0.finishedAt ?? 0) ? [a0, b0] : [b0, a0];
  const samePair = a.reference.id === b.reference.id && a.target.id === b.target.id;

  const header = (
    <PageHeader
      title="Compare runs"
      description={`${a.reference.name} → ${a.target.name} · how differences changed between two saved runs`}
      action={
        <Link href="/history" className="text-sm text-muted hover:text-text">
          ← Drift History
        </Link>
      }
    />
  );

  if (!samePair || a.id === b.id) {
    return (
      <>
        {header}
        <Card role="alert" className="m-8 flex gap-3 border-missing/40 p-4 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-missing" aria-hidden />
          <span>
            {a.id === b.id
              ? "Pick two different runs."
              : "These runs are for different reference → target pairs, so their differences can't be compared. Pick two runs of the same pair."}
          </span>
        </Card>
      </>
    );
  }

  const runs = await getRunData([a, b], true);
  const c = compareRuns(runs.get(a.id)!, runs.get(b.id)!);
  const acks = await getAcks(a.reference.id, a.target.id);
  const first = await firstDetected(a.reference.id, a.target.id, c.persistent.map((p) => p.diff.id));

  const trulyNew = c.introduced.filter((x) => !x.notCheckedBefore);
  const notCheckedBefore = c.introduced.filter((x) => x.notCheckedBefore);

  return (
    <>
      {header}
      <div className="grid gap-6 p-8">
        <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
          <RunCard label="Earlier run" s={a} />
          <ArrowRight size={18} className="hidden justify-self-center text-muted md:block" aria-hidden />
          <RunCard label="Later run" s={b} />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{a.reference.name}</span>
          <EnvBadge environment={a.reference.environment} />
          <ArrowRight size={12} className="text-muted" aria-label="to" />
          <span className="font-medium">{a.target.name}</span>
          <EnvBadge environment={a.target.environment} />
        </div>

        {(a.status === "failed" || b.status === "failed") && (
          <Card role="alert" className="flex gap-3 border-danger/40 p-4 text-sm">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            <span>
              {b.status === "failed"
                ? "The later run failed, so nothing can be called resolved. Everything from the earlier run is listed as no longer checked."
                : "The earlier run failed, so it has no differences to compare against. Differences in the later run can't be confirmed as new."}
            </span>
          </Card>
        )}
        {b.status === "partial" && (
          <Card role="alert" className="flex gap-3 border-missing/40 p-4 text-sm">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-missing" aria-hidden />
            <span>The later run was partial. Object types it couldn&apos;t read are listed as no longer checked, not resolved.</span>
          </Card>
        )}
        {c.scopeChanges.length > 0 && (
          <Card className="flex gap-3 border-missing/40 p-4 text-sm">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-missing" aria-hidden />
            <div>
              <p className="font-medium">The scan scope changed between these runs.</p>
              <ul className="mt-1 text-muted">
                {c.scopeChanges.map((s) => (
                  <li key={s} className="font-mono text-xs">
                    {s}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted">Differences that left the scope are shown as no longer checked, not resolved.</p>
            </div>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "New", value: trulyNew.length, tone: "text-accent" },
            { label: "Resolved", value: c.resolved.length, tone: "text-ok" },
            { label: "Persistent", value: c.persistent.length, tone: "text-text" },
            { label: "No longer checked", value: c.unverified.length + notCheckedBefore.length, tone: "text-missing" },
          ].map((m) => (
            <Card key={m.label} className="p-4">
              <div className={cn("text-xs font-medium", m.tone)}>{m.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{m.value}</div>
            </Card>
          ))}
        </div>

        <Section title="New" hint="Found in the later run but not in the earlier one." count={trulyNew.length} tone="text-accent">
          {trulyNew.map(({ diff }) => (
            <Row key={diff.id} d={diff} ack={acks[diff.id]} />
          ))}
        </Section>

        <Section
          title="Resolved"
          hint="Found in the earlier run, and the later run checked the same object and no longer found the difference."
          count={c.resolved.length}
          tone="text-ok"
        >
          {c.resolved.map((d) => (
            <Row key={d.id} d={d} ack={acks[d.id]} />
          ))}
        </Section>

        <Section
          title="Persistent"
          hint="Present in both runs. Acknowledged items are still differences."
          count={c.persistent.length}
          tone="text-text"
        >
          {c.persistent.map(({ diff, definitionChanged }) => (
            <Row
              key={diff.id}
              d={diff}
              ack={acks[diff.id]}
              extra={
                <span className="text-xs text-muted">
                  {definitionChanged && <span className="mr-2 text-modified">definition changed</span>}
                  {first[diff.id] && <>first detected {fmt(first[diff.id])}</>}
                </span>
              }
            />
          ))}
        </Section>

        <Section
          title="No longer checked"
          hint="Not counted as resolved or new, because one of the runs didn't check this object."
          count={c.unverified.length + notCheckedBefore.length}
          tone="text-missing"
        >
          {c.unverified.map(({ diff, reason }) => (
            <Row key={`u-${diff.id}`} d={diff} ack={acks[diff.id]} extra={<span className="text-xs text-missing">gone from later run: {UNVERIFIED_LABEL[reason]}</span>} />
          ))}
          {notCheckedBefore.map(({ diff, notCheckedBefore: reason }) => (
            <Row
              key={`n-${diff.id}`}
              d={diff}
              ack={acks[diff.id]}
              extra={<span className="text-xs text-missing">appeared in later run, but earlier: {UNVERIFIED_LABEL[reason!].replace("later", "earlier")}</span>}
            />
          ))}
        </Section>
      </div>
    </>
  );
}
