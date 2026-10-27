"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  RotateCw,
  History,
  Search,
  Sparkles,
  Table2,
  XCircle,
} from "lucide-react";
import type { Difference, DiffKind, ObjectKind, Severity } from "@/engine/types";
import type { SavedScan } from "@/lib/scans";
import type { AckState } from "@/lib/acks";
import { setAcknowledgement } from "../actions";
import {
  FIELD_LABEL,
  KIND_LABEL,
  KIND_SYMBOL,
  OBJECT_LABEL,
  SEVERITY_LABEL,
  formatDefinition,
  formatDuration,
  formatValue,
} from "@/lib/format";
import { ScanStatusPill } from "@/components/scan-status";
import { Card, EnvBadge, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

const KINDS: DiffKind[] = ["missing", "extra", "modified"];
const SEVERITIES: Severity[] = ["breaking", "warning", "info"];
const CATEGORY_LABEL: Record<string, string> = {
  columns: "columns",
  primaryKeys: "primary keys",
  foreignKeys: "foreign keys",
  uniques: "unique constraints",
  indexes: "indexes",
};

const KIND_TEXT: Record<DiffKind, string> = { missing: "text-missing", extra: "text-extra", modified: "text-modified" };
const SEV_TEXT: Record<Severity, string> = { breaking: "text-danger", warning: "text-missing", info: "text-muted" };

function KindTag({ kind }: { kind: DiffKind }) {
  return (
    <span className={cn("inline-flex w-24 shrink-0 items-center gap-1.5 font-mono text-xs font-medium", KIND_TEXT[kind])}>
      <span aria-hidden className="w-3 text-center">
        {KIND_SYMBOL[kind]}
      </span>
      {KIND_LABEL[kind]}
    </span>
  );
}

function SeverityTag({ severity }: { severity: Severity }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs", SEV_TEXT[severity])}>
      {severity === "breaking" && <AlertTriangle size={12} aria-hidden />}
      {severity === "breaking" ? "Potentially breaking" : SEVERITY_LABEL[severity]}
    </span>
  );
}

// ---------- header + status ----------

function Header({ scan }: { scan: SavedScan }) {
  const allCategories = scan.scope.categories.length === Object.keys(CATEGORY_LABEL).length;
  return (
    <header className="border-b border-border px-8 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            <span>{scan.reference.name}</span>
            <EnvBadge environment={scan.reference.environment} />
            <ArrowRight size={18} className="text-muted" aria-label="compared to" />
            <span>{scan.target.name}</span>
            <EnvBadge environment={scan.target.environment} />
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <ScanStatusPill status={scan.status} summary={scan.summary} />
            <span aria-hidden>·</span>
            <time dateTime={scan.finishedAt ?? undefined} suppressHydrationWarning>
              {scan.finishedAt ? new Date(scan.finishedAt).toLocaleString() : "not finished"}
            </time>
            {scan.startedAt && scan.finishedAt && <span>· took {formatDuration(scan.startedAt, scan.finishedAt)}</span>}
          </div>
          <p className="mt-1 text-xs text-muted">
            Scope: schemas <span className="font-mono text-text">{scan.scope.schemas.join(", ")}</span>
            {" · "}
            {allCategories ? "all object types" : `tables + ${scan.scope.categories.map((c) => CATEGORY_LABEL[c]).join(", ")}`}
            {scan.scope.excludeTables.length > 0 && (
              <>
                {" · "}excluding <span className="font-mono text-text">{scan.scope.excludeTables.join(", ")}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/comparisons/new?reference=${scan.reference.id}&target=${scan.target.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            <RotateCw size={14} aria-hidden /> Run again
          </Link>
          {scan.status !== "failed" && (
            <Link
              href={`/connections/${scan.target.id}/schema?scan=${scan.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <Table2 size={14} aria-hidden /> Explore target
            </Link>
          )}
          <a
            href={`/comparisons/${scan.id}/export?format=json`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            <Download size={14} aria-hidden /> JSON
          </a>
          <a
            href={`/comparisons/${scan.id}/export?format=csv`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            <Download size={14} aria-hidden /> CSV
          </a>
        </div>
      </div>
    </header>
  );
}

function StatusBanner({ scan }: { scan: SavedScan }) {
  const errors = scan.errors.map((e) => (
    <li key={`${e.side}-${e.stage}-${e.scope ?? ""}-${e.message}`}>
      <span className="font-medium capitalize text-text">{e.side === "reference" ? scan.reference.name : scan.target.name}</span>
      {" · "}
      {e.stage === "connect" ? "could not connect" : e.stage === "privileges" ? "limited privileges" : `could not read ${e.scope ?? "metadata"}`}
      : <span className="font-mono text-xs">{e.message}</span>
    </li>
  ));

  return (
    <div className="grid gap-3">
      {scan.status === "failed" && (
        <Card role="alert" className="flex gap-3 border-danger/40 p-4 text-sm">
          <XCircle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-medium">The scan failed, so no comparison was made.</p>
            <p className="mt-0.5 text-muted">This is not a healthy result. Fix the problem below and run it again.</p>
            <ul className="mt-2 grid gap-1 text-muted">{errors}</ul>
          </div>
        </Card>
      )}
      {scan.status === "partial" && (
        <Card role="alert" className="flex gap-3 border-missing/40 p-4 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-missing" aria-hidden />
          <div>
            <p className="font-medium">Partial scan: parity can&apos;t be confirmed.</p>
            <p className="mt-0.5 text-muted">
              Some metadata could not be read. Those object types were skipped rather than reported as missing, so the list below may be incomplete.
            </p>
            <ul className="mt-2 grid gap-1 text-muted">{errors}</ul>
          </div>
        </Card>
      )}
      {scan.status === "completed" && scan.summary.inParity && (
        <Card className="flex gap-3 border-ok/40 p-4 text-sm">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" aria-hidden />
          <div>
            <p className="font-medium">In parity for the selected scope.</p>
            <p className="mt-0.5 text-muted">
              {scan.target.name} matches {scan.reference.name} for every object type that was compared.
            </p>
          </div>
        </Card>
      )}
      {scan.warnings.map((w) => (
        <p key={w} className="flex items-center gap-2 text-sm text-muted">
          <AlertTriangle size={14} className="text-missing" aria-hidden /> {w}
        </p>
      ))}
    </div>
  );
}

// ---------- summary ----------

function SummaryCards({
  scan,
  kinds,
  onKind,
}: {
  scan: SavedScan;
  kinds: DiffKind[];
  onKind: (k: DiffKind) => void;
}) {
  const s = scan.summary;
  const counts: Record<DiffKind, number> = { missing: s.missing, extra: s.extra, modified: s.modified };
  const desc: Record<DiffKind, string> = {
    missing: `in ${scan.reference.name}, not in ${scan.target.name}`,
    extra: `only in ${scan.target.name}`,
    modified: "exists in both, defined differently",
  };
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {KINDS.map((k) => {
        const active = kinds.includes(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={active}
            onClick={() => onKind(k)}
            className={cn(
              "rounded-lg border bg-surface p-4 text-left transition-colors hover:bg-surface-2",
              active ? "border-accent/60" : "border-border",
            )}
          >
            <div className={cn("flex items-center gap-1.5 text-xs font-medium", KIND_TEXT[k])}>
              <span aria-hidden className="font-mono">
                {KIND_SYMBOL[k]}
              </span>
              {KIND_LABEL[k]}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{counts[k]}</div>
            <div className="mt-0.5 truncate text-xs text-muted" title={desc[k]}>
              {desc[k]}
            </div>
          </button>
        );
      })}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="text-xs font-medium text-muted">By severity</div>
        <dl className="mt-2 grid gap-1 text-sm">
          {SEVERITIES.map((sv) => (
            <div key={sv} className="flex justify-between">
              <dt className={SEV_TEXT[sv]}>{sv === "breaking" ? "Potentially breaking" : SEVERITY_LABEL[sv]}</dt>
              <dd className="tabular-nums">{s.bySeverity[sv]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

// ---------- difference rows ----------

function DefinitionBlock({ title, lines, empty }: { title: string; lines: string[]; empty: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-muted">{title}</div>
      <pre className="overflow-x-auto rounded-md border border-border bg-bg p-3 font-mono text-xs leading-relaxed">
        {lines.length ? lines.join("\n") : <span className="italic text-muted">{empty}</span>}
      </pre>
    </div>
  );
}

function AckPanel({ scanId, d, ack }: { scanId: string; d: Difference; ack?: AckState }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (acknowledged: boolean) =>
    start(async () => {
      setError(null);
      const r = await setAcknowledgement(scanId, d.id, acknowledged, note);
      if (!r.ok) return setError(r.error);
      setNote("");
      router.refresh();
    });

  return (
    <div className="rounded-md border border-border bg-bg p-3 text-sm">
      {ack ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-ok">
            <CheckCircle2 size={14} aria-hidden /> Acknowledged
          </span>
          <span className="text-xs text-muted" suppressHydrationWarning>
            {new Date(ack.at).toLocaleString()}
            {ack.note ? ` · “${ack.note}”` : ""}
          </span>
          <button type="button" onClick={() => act(false)} disabled={pending} className="ml-auto text-xs text-muted hover:text-text">
            Reopen
          </button>
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Acknowledgement note (optional)"
              placeholder="Note (optional), e.g. intentional in production"
              className="h-8 min-w-56 flex-1 rounded-md border border-border bg-surface px-2.5 text-xs placeholder:text-muted/60 focus:border-accent focus:outline-none"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="button"
              onClick={() => act(true)}
              disabled={pending}
              className="h-8 rounded-md border border-border bg-surface px-3 text-xs hover:bg-surface-2 disabled:opacity-50"
            >
              Acknowledge
            </button>
          </div>
          <p className="text-xs text-muted">Marks this as reviewed. It does not fix the difference and never counts as parity.</p>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function DifferenceRow({
  d,
  scan,
  open,
  onToggle,
  ack,
  isNew,
}: {
  d: Difference;
  scan: SavedScan;
  open: boolean;
  onToggle: () => void;
  ack?: AckState;
  isNew: boolean;
}) {
  const name = d.table ? d.path.slice(`${d.schema}.${d.table}`.length + 1) || d.path : d.path;
  const panelId = `diff-${d.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  return (
    <li className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2"
      >
        {open ? <ChevronDown size={14} className="shrink-0 text-muted" aria-hidden /> : <ChevronRight size={14} className="shrink-0 text-muted" aria-hidden />}
        <KindTag kind={d.kind} />
        <span className="w-24 shrink-0 text-xs text-muted">{OBJECT_LABEL[d.objectKind]}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{d.objectKind === "table" ? d.table : name}</span>
        {d.changes.length > 0 && (
          <span className="hidden truncate text-xs text-muted md:inline">
            {d.changes.map((c) => FIELD_LABEL[c.field] ?? c.field).join(", ")}
          </span>
        )}
        {isNew && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent">
            <Sparkles size={11} aria-hidden /> New
          </span>
        )}
        {ack && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-ok">
            <CheckCircle2 size={11} aria-hidden /> Acknowledged
          </span>
        )}
        <SeverityTag severity={d.severity} />
      </button>
      {open && (
        <div id={panelId} className="grid gap-4 px-4 pb-4 pl-11">
          <p className="text-sm">{d.note}</p>
          {d.changes.length > 0 && (
            <table className="w-full max-w-2xl text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-4 font-medium">Changed</th>
                  <th className="py-1 pr-4 font-medium">Expected ({scan.reference.name})</th>
                  <th className="py-1 font-medium">Actual ({scan.target.name})</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {d.changes.map((c) => (
                  <tr key={c.field} className="border-t border-border">
                    <td className="py-1.5 pr-4 font-sans">{FIELD_LABEL[c.field] ?? c.field}</td>
                    <td className="py-1.5 pr-4">{formatValue(c.field, c.expected)}</td>
                    <td className="py-1.5">{formatValue(c.field, c.actual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <DefinitionBlock title={`Expected · ${scan.reference.name}`} lines={formatDefinition(d.objectKind, d.expected)} empty="Not defined in reference" />
            <DefinitionBlock title={`Actual · ${scan.target.name}`} lines={formatDefinition(d.objectKind, d.actual)} empty="Not found in target" />
          </div>
          <div className="text-sm">
            <span className="text-xs font-medium text-muted">Suggested action · advisory, review before applying</span>
            <p className="mt-0.5">{d.suggestedAction}</p>
          </div>
          <AckPanel scanId={scan.id} d={d} ack={ack} />
        </div>
      )}
    </li>
  );
}

// ---------- main view ----------

interface Group {
  key: string;
  schema: string;
  table: string | null;
  items: Difference[];
}

export interface SincePrevious {
  previousId: string;
  previousFinishedAt: string | null;
  introducedKeys: string[];
  resolved: number;
  unverified: number;
  persistent: number;
  scopeChanged: boolean;
}

function SinceBar({ scan, since }: { scan: SavedScan; since: SincePrevious | null }) {
  if (scan.status === "failed") return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <History size={14} className="text-muted" aria-hidden />
      {since ? (
        <>
          <span className="text-muted">
            Since the previous run{" "}
            <time suppressHydrationWarning>{since.previousFinishedAt ? new Date(since.previousFinishedAt).toLocaleString() : ""}</time>:
          </span>
          <span>
            <span className="text-accent">{since.introducedKeys.length} new</span> · {since.resolved} resolved · {since.persistent} persistent
            {since.unverified > 0 && <span className="text-missing"> · {since.unverified} not checked in both runs</span>}
          </span>
          {since.scopeChanged && <span className="text-xs text-missing">(scope changed)</span>}
          <Link href={`/history/compare?from=${since.previousId}&to=${scan.id}`} className="text-accent hover:underline">
            Compare runs
          </Link>
        </>
      ) : (
        <span className="text-muted">First successful run for this pair, so there&apos;s nothing to compare against yet.</span>
      )}
    </div>
  );
}

export function ResultsView({
  scan,
  acks = {},
  sincePrevious = null,
}: {
  scan: SavedScan;
  acks?: Record<string, AckState>;
  sincePrevious?: SincePrevious | null;
}) {
  const [review, setReview] = useState<"" | "open" | "acknowledged" | "new">("");
  const newKeys = useMemo(() => new Set(sincePrevious?.introducedKeys ?? []), [sincePrevious]);
  const ackCount = scan.differences.filter((d) => acks[d.id]).length;
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<DiffKind[]>([]);
  const [severities, setSeverities] = useState<Severity[]>([]);
  const [objectKind, setObjectKind] = useState<ObjectKind | "">("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const toggleSet = (set: Set<string>, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scan.differences.filter(
      (d) =>
        (!q || d.path.toLowerCase().includes(q)) &&
        (!kinds.length || kinds.includes(d.kind)) &&
        (!severities.length || severities.includes(d.severity)) &&
        (!objectKind || d.objectKind === objectKind) &&
        (!review ||
          (review === "acknowledged" && Boolean(acks[d.id])) ||
          (review === "open" && !acks[d.id]) ||
          (review === "new" && newKeys.has(d.id))),
    );
  }, [scan.differences, query, kinds, severities, objectKind, review, acks, newKeys]);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const d of filtered) {
      const key = d.table ? `${d.schema}.${d.table}` : d.schema;
      if (!map.has(key)) map.set(key, { key, schema: d.schema, table: d.table, items: [] });
      map.get(key)!.items.push(d);
    }
    const order: Record<ObjectKind, number> = { schema: 0, table: 1, column: 2, primary_key: 3, foreign_key: 4, unique: 5, index: 6 };
    for (const g of map.values()) g.items.sort((a, b) => order[a.objectKind] - order[b.objectKind] || a.path.localeCompare(b.path));
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [filtered]);

  const presentKinds = useMemo(() => [...new Set(scan.differences.map((d) => d.objectKind))], [scan.differences]);
  const anyFilter = Boolean(query || kinds.length || severities.length || objectKind || review);
  const allOpen = filtered.length > 0 && filtered.every((d) => open.has(d.id));

  return (
    <>
      <Header scan={scan} />
      <div className="grid gap-6 p-8">
        {(scan.status !== "completed" || scan.summary.inParity || scan.warnings.length > 0) && <StatusBanner scan={scan} />}
        <SinceBar scan={scan} since={sincePrevious} />
        {scan.status !== "failed" && (
          <>
            <SummaryCards scan={scan} kinds={kinds} onKind={(k) => setKinds(toggleIn(kinds, k))} />

            {scan.differences.length > 0 && (
              <section aria-label="Differences" className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-56 flex-1">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                    <Input
                      aria-label="Search by schema, table or column"
                      placeholder="Search schema, table or column…"
                      className="pl-8"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <Select aria-label="Review status" className="w-40" value={review} onChange={(e) => setReview(e.target.value as typeof review)}>
                    <option value="">All review states</option>
                    {sincePrevious && <option value="new">New since last run</option>}
                    <option value="open">Not acknowledged</option>
                    <option value="acknowledged">Acknowledged ({ackCount})</option>
                  </Select>
                  <Select aria-label="Object type" className="w-40" value={objectKind} onChange={(e) => setObjectKind(e.target.value as ObjectKind | "")}>
                    <option value="">All object types</option>
                    {presentKinds.map((k) => (
                      <option key={k} value={k}>
                        {OBJECT_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                  <div role="group" aria-label="Difference type" className="flex gap-1">
                    {KINDS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={kinds.includes(k)}
                        onClick={() => setKinds(toggleIn(kinds, k))}
                        className={cn(
                          "rounded-md border px-2.5 py-1.5 text-xs",
                          kinds.includes(k) ? "border-accent/60 bg-accent/10 text-text" : "border-border text-muted hover:text-text",
                        )}
                      >
                        {KIND_SYMBOL[k]} {KIND_LABEL[k]}
                      </button>
                    ))}
                  </div>
                  <div role="group" aria-label="Severity" className="flex gap-1">
                    {SEVERITIES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={severities.includes(s)}
                        onClick={() => setSeverities(toggleIn(severities, s))}
                        className={cn(
                          "rounded-md border px-2.5 py-1.5 text-xs",
                          severities.includes(s) ? "border-accent/60 bg-accent/10 text-text" : "border-border text-muted hover:text-text",
                        )}
                      >
                        {s === "breaking" ? "Breaking" : SEVERITY_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted">
                  <span role="status">
                    Showing {filtered.length} of {scan.differences.length} difference{scan.differences.length === 1 ? "" : "s"}
                    {anyFilter && (
                      <button
                        type="button"
                        className="ml-2 text-accent hover:underline"
                        onClick={() => {
                          setQuery("");
                          setKinds([]);
                          setSeverities([]);
                          setObjectKind("");
                          setReview("");
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </span>
                  <button
                    type="button"
                    className="hover:text-text"
                    onClick={() => setOpen(allOpen ? new Set() : new Set(filtered.map((d) => d.id)))}
                  >
                    {allOpen ? "Collapse all details" : "Expand all details"}
                  </button>
                </div>

                {groups.length === 0 ? (
                  <Card className="p-8 text-center text-sm text-muted">No differences match these filters.</Card>
                ) : (
                  groups.map((g) => {
                    const isCollapsed = collapsed.has(g.key);
                    return (
                      <Card key={g.key} className="overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setCollapsed(toggleSet(collapsed, g.key))}
                          aria-expanded={!isCollapsed}
                          className="flex w-full items-center gap-2 bg-surface-2/60 px-4 py-2 text-left"
                        >
                          {isCollapsed ? <ChevronRight size={14} className="text-muted" aria-hidden /> : <ChevronDown size={14} className="text-muted" aria-hidden />}
                          <span className="font-mono text-sm">
                            {g.table ? (
                              <>
                                <span className="text-muted">{g.schema}.</span>
                                {g.table}
                              </>
                            ) : (
                              <>
                                <span className="text-muted">schema </span>
                                {g.schema}
                              </>
                            )}
                          </span>
                          <span className="text-xs text-muted">
                            · {g.items.length} difference{g.items.length === 1 ? "" : "s"}
                          </span>
                        </button>
                        {!isCollapsed && (
                          <ul>
                            {g.items.map((d) => (
                              <DifferenceRow
                                key={d.id}
                                d={d}
                                scan={scan}
                                open={open.has(d.id)}
                                onToggle={() => setOpen(toggleSet(open, d.id))}
                                ack={acks[d.id]}
                                isNew={newKeys.has(d.id)}
                              />
                            ))}
                          </ul>
                        )}
                      </Card>
                    );
                  })
                )}
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
