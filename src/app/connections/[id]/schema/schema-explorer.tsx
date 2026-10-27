"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, KeyRound, Search, Table2 } from "lucide-react";
import type { DiffKind, ObjectKind, ScanError, Severity, Snapshot, TableDef } from "@/engine/types";
import { KIND_SYMBOL } from "@/lib/format";
import { Card, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface Highlight {
  path: string;
  kind: DiffKind;
  objectKind: ObjectKind;
  severity: Severity;
  note: string;
}

const MAX_LIST = 400; // keep the tree light on very large databases
const KIND_TEXT: Record<DiffKind, string> = { missing: "text-missing", extra: "text-extra", modified: "text-modified" };

function Mark({ h }: { h?: Highlight; side?: "reference" | "target" }) {
  if (!h) return null;
  const label = h.kind === "missing" ? "Missing in target" : h.kind === "extra" ? "Only in target" : "Modified";
  return (
    <span title={h.note} className={cn("inline-flex items-center gap-1 whitespace-nowrap font-mono text-[11px]", KIND_TEXT[h.kind])}>
      <span aria-hidden>{KIND_SYMBOL[h.kind]}</span>
      {label}
    </span>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        {title} <span className="text-muted/70">· {count}</span>
      </h3>
      {count === 0 ? <p className="text-sm text-muted/70">None</p> : children}
    </section>
  );
}

const th = "py-1.5 pr-4 text-left text-xs font-medium text-muted";
const td = "py-1.5 pr-4 align-top";

export function SchemaExplorer({
  connectionId,
  snapshot,
  errors,
  initialTable,
  highlights,
  context,
}: {
  connectionId: string;
  snapshot: Snapshot;
  errors: ScanError[];
  initialTable: string | null;
  highlights: Highlight[];
  context: { id: string; label: string; side: "reference" | "target" } | null;
}) {
  const tables = useMemo(() => Object.values(snapshot.tables).sort((a, b) => `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`)), [snapshot]);
  const hl = useMemo(() => new Map(highlights.map((h) => [h.path, h])), [highlights]);
  const tableHits = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of highlights) {
      const parts = h.path.split(".");
      if (parts.length >= 2) m.set(`${parts[0]}.${parts[1]}`, (m.get(`${parts[0]}.${parts[1]}`) ?? 0) + 1);
    }
    return m;
  }, [highlights]);

  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [selected, setSelected] = useState<string | null>(
    initialTable && snapshot.tables[initialTable] ? initialTable : (tables[0] ? `${tables[0].schema}.${tables[0].name}` : null),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tables
      .map((t) => {
        const key = `${t.schema}.${t.name}`;
        const nameHit = !q || key.toLowerCase().includes(q);
        const colHits = q && !nameHit ? Object.keys(t.columns).filter((c) => c.toLowerCase().includes(q)) : [];
        return { t, key, nameHit, colHits };
      })
      .filter((x) => (x.nameHit || x.colHits.length > 0) && (!onlyChanged || tableHits.has(x.key)));
  }, [tables, query, onlyChanged, tableHits]);

  const bySchema = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const x of filtered.slice(0, MAX_LIST)) {
      if (!m.has(x.t.schema)) m.set(x.t.schema, []);
      m.get(x.t.schema)!.push(x);
    }
    return m;
  }, [filtered]);

  const select = (key: string) => {
    setSelected(key);
    const url = new URL(window.location.href);
    url.searchParams.set("table", key);
    window.history.replaceState(null, "", url);
  };

  const table = selected ? snapshot.tables[selected] : null;

  // Incoming foreign keys ("referenced by") for the selected table.
  const referencedBy = useMemo(() => {
    if (!table) return [];
    const out: { from: TableDef; fk: TableDef["foreignKeys"][string] }[] = [];
    for (const t of tables)
      for (const fk of Object.values(t.foreignKeys))
        if (fk.refSchema === table.schema && fk.refTable === table.name) out.push({ from: t, fk });
    return out;
  }, [table, tables]);

  return (
    <div className="grid gap-4 p-8">
      {context && (
        <Card className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
          <span className="text-muted">Highlighting differences from</span>
          <Link href={`/comparisons/${context.id}`} className="font-medium hover:underline">
            {context.label}
          </Link>
          <span className="text-xs text-muted">
            ({highlights.length} on this side · objects missing here are listed on the results page)
          </span>
          <Link href={`/connections/${connectionId}/schema${selected ? `?table=${encodeURIComponent(selected)}` : ""}`} className="ml-auto text-xs text-muted hover:text-text">
            Clear highlighting
          </Link>
        </Card>
      )}
      {errors.length > 0 && (
        <Card role="alert" className="flex gap-2 border-missing/40 px-4 py-2.5 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-missing" aria-hidden />
          <span>
            Some metadata couldn&apos;t be read, so parts of this view may be empty:{" "}
            <span className="font-mono text-xs text-muted">{errors.map((e) => `${e.scope ?? e.stage}: ${e.message}`).join("; ")}</span>
          </span>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        {/* Tree */}
        <Card className="flex max-h-[calc(100vh-14rem)] flex-col overflow-hidden">
          <div className="grid gap-2 border-b border-border p-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <Input aria-label="Search tables and columns" placeholder="Search tables, columns…" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {highlights.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" className="accent-[var(--accent)]" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
                Only tables with differences
              </label>
            )}
            <p className="text-xs text-muted">
              {filtered.length} of {tables.length} table{tables.length === 1 ? "" : "s"}
            </p>
          </div>
          <nav aria-label="Tables" className="flex-1 overflow-y-auto p-2">
            {[...bySchema.entries()].map(([schema, items]) => (
              <div key={schema} className="mb-2">
                <div className="px-2 py-1 font-mono text-xs text-muted">{schema}</div>
                <ul>
                  {items.map(({ t, key, colHits }) => (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => select(key)}
                        aria-current={selected === key ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-surface-2",
                          selected === key && "bg-surface-2",
                        )}
                      >
                        <Table2 size={14} className="shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-mono">{t.name}</span>
                        {tableHits.has(key) && (
                          <span
                            className="rounded bg-modified/15 px-1.5 font-mono text-[11px] text-modified"
                            title={`${tableHits.get(key)} object(s) with differences`}
                          >
                            {tableHits.get(key)}
                            <span className="sr-only"> differences</span>
                          </span>
                        )}
                      </button>
                      {colHits.length > 0 && (
                        <div className="truncate pl-8 font-mono text-[11px] text-muted">↳ {colHits.slice(0, 3).join(", ")}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {filtered.length > MAX_LIST && (
              <p className="px-2 py-2 text-xs text-muted">Showing the first {MAX_LIST}. Refine the search to see more.</p>
            )}
            {filtered.length === 0 && <p className="px-2 py-2 text-sm text-muted">No tables match.</p>}
          </nav>
        </Card>

        {/* Details */}
        {!table ? (
          <Card className="grid place-items-center p-12 text-sm text-muted">
            {tables.length === 0 ? "No tables in the included schemas." : "Select a table."}
          </Card>
        ) : (
          <Card className="grid content-start gap-6 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-mono text-lg">
                <span className="text-muted">{table.schema}.</span>
                {table.name}
              </h2>
              <div className="flex items-center gap-3 text-xs text-muted">
                <Mark h={hl.get(`${table.schema}.${table.name}`)} side={context?.side ?? "target"} />
                <span>
                  {Object.keys(table.columns).length} columns · {Object.keys(table.indexes).length} indexes
                </span>
              </div>
            </div>

            <Section title="Columns" count={Object.keys(table.columns).length}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={th}>Name</th>
                      <th className={th}>Type</th>
                      <th className={th}>Nullable</th>
                      <th className={th}>Default</th>
                      {context && <th className={th}>Difference</th>}
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs">
                    {Object.values(table.columns)
                      .sort((a, b) => a.position - b.position)
                      .map((c) => {
                        const isPk = table.primaryKey?.columns.includes(c.name);
                        const h = hl.get(`${table.schema}.${table.name}.${c.name}`);
                        return (
                          <tr key={c.name} className={cn("border-b border-border/60", h && "bg-surface-2/60")}>
                            <td className={td}>
                              <span className="inline-flex items-center gap-1.5">
                                {c.name}
                                {isPk && (
                                  <span className="inline-flex items-center gap-0.5 font-sans text-[10px] text-accent" title="Primary key">
                                    <KeyRound size={11} aria-hidden /> PK
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className={td}>{c.type}</td>
                            <td className={cn(td, "whitespace-nowrap font-sans")}>{c.nullable ? "null" : "NOT NULL"}</td>
                            <td className={cn(td, "max-w-64 truncate text-muted")} title={c.default ?? undefined}>
                              {c.identity ? `identity (${c.identity === "a" ? "always" : "by default"})` : (c.default ?? "")}
                            </td>
                            {context && (
                              <td className={td}>
                                <Mark h={h} side={context.side} />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Primary key" count={table.primaryKey ? 1 : 0}>
              {table.primaryKey && (
                <p className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-muted">{table.primaryKey.name}</span> ({table.primaryKey.columns.join(", ")})
                  <Mark h={hl.get(`${table.schema}.${table.name}.${table.primaryKey.name}`)} side={context?.side ?? "target"} />
                </p>
              )}
            </Section>

            <Section title="Foreign keys" count={Object.keys(table.foreignKeys).length}>
              <ul className="grid gap-1.5 font-mono text-xs">
                {Object.values(table.foreignKeys).map((fk) => {
                  const ref = `${fk.refSchema}.${fk.refTable}`;
                  return (
                    <li key={fk.name} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>({fk.columns.join(", ")})</span>
                      <ArrowRight size={12} className="text-muted" aria-label="references" />
                      {snapshot.tables[ref] ? (
                        <button type="button" className="text-accent hover:underline" onClick={() => select(ref)}>
                          {ref}
                        </button>
                      ) : (
                        <span>{ref}</span>
                      )}
                      <span>({fk.refColumns.join(", ")})</span>
                      <span className="font-sans text-muted">
                        on delete {fk.onDelete.toLowerCase()} · on update {fk.onUpdate.toLowerCase()} · {fk.name}
                      </span>
                      <Mark h={hl.get(`${table.schema}.${table.name}.${fk.name}`)} side={context?.side ?? "target"} />
                    </li>
                  );
                })}
              </ul>
            </Section>

            <Section title="Referenced by" count={referencedBy.length}>
              <ul className="grid gap-1.5 font-mono text-xs">
                {referencedBy.map(({ from, fk }) => {
                  const key = `${from.schema}.${from.name}`;
                  return (
                    <li key={`${key}.${fk.name}`} className="flex flex-wrap items-center gap-2">
                      <button type="button" className="text-accent hover:underline" onClick={() => select(key)}>
                        {key}
                      </button>
                      <span>({fk.columns.join(", ")})</span>
                      <span className="font-sans text-muted">· {fk.name}</span>
                    </li>
                  );
                })}
              </ul>
            </Section>

            <Section title="Unique constraints" count={Object.keys(table.uniques).length}>
              <ul className="grid gap-1.5 font-mono text-xs">
                {Object.values(table.uniques).map((u) => (
                  <li key={u.name} className="flex items-center gap-3">
                    <span className="text-muted">{u.name}</span> ({u.columns.join(", ")})
                    <Mark h={hl.get(`${table.schema}.${table.name}.${u.name}`)} side={context?.side ?? "target"} />
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Indexes" count={Object.keys(table.indexes).length}>
              <ul className="grid gap-1.5 font-mono text-xs">
                {Object.values(table.indexes).map((i) => (
                  <li key={i.name} className="flex flex-wrap items-center gap-x-3">
                    <span className="text-muted">
                      {i.unique ? "unique " : ""}
                      {i.name}
                    </span>
                    {i.definition}
                    <Mark h={hl.get(`${table.schema}.${table.name}.${i.name}`)} side={context?.side ?? "target"} />
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted/80">Indexes that back primary keys and unique constraints are listed with those constraints.</p>
            </Section>
          </Card>
        )}
      </div>
    </div>
  );
}
