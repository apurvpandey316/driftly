"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowRight, ArrowLeftRight, Loader2 } from "lucide-react";
import type { PublicConnection } from "@/lib/connections";
import { Button } from "@/components/button";
import { Card, EnvBadge, Field, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { runComparison } from "../actions";

const CATEGORIES = [
  { id: "columns", label: "Columns", hint: "existence, type, nullability, default" },
  { id: "primaryKeys", label: "Primary keys", hint: "key columns" },
  { id: "foreignKeys", label: "Foreign keys", hint: "references and actions" },
  { id: "uniques", label: "Unique constraints", hint: "key definitions" },
  { id: "indexes", label: "Indexes", hint: "columns, uniqueness, definition" },
];

function pickDefaults(list: PublicConnection[], ref?: string, tgt?: string) {
  const byEnv = (e: string) => list.find((c) => c.environment === e)?.id;
  const reference = (ref && list.some((c) => c.id === ref) && ref) || byEnv("development") || list[0].id;
  const target =
    (tgt && tgt !== reference && list.some((c) => c.id === tgt) && tgt) ||
    [byEnv("production"), byEnv("staging"), ...list.map((c) => c.id)].find((id) => id && id !== reference)!;
  return { reference, target };
}

export function ComparisonForm({
  connections,
  initialReference,
  initialTarget,
}: {
  connections: PublicConnection[];
  initialReference?: string;
  initialTarget?: string;
}) {
  const router = useRouter();
  const defaults = useMemo(() => pickDefaults(connections, initialReference, initialTarget), [connections, initialReference, initialTarget]);
  const [referenceId, setReferenceId] = useState(defaults.reference);
  const [targetId, setTargetId] = useState(defaults.target);
  const ref = connections.find((c) => c.id === referenceId)!;
  const tgt = connections.find((c) => c.id === targetId);

  const schemaOptions = useMemo(
    () => [...new Set([...(ref?.includedSchemas ?? []), ...(tgt?.includedSchemas ?? [])])],
    [ref, tgt],
  );
  const [schemas, setSchemas] = useState<string[]>(ref.includedSchemas);
  const [excludeTables, setExcludeTables] = useState("");
  const [categories, setCategories] = useState<string[]>(CATEGORIES.map((c) => c.id));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [elapsed, setElapsed] = useState(0);

  // Keep selected schemas valid when connections change.
  useEffect(() => {
    setSchemas((s) => {
      const kept = s.filter((x) => schemaOptions.includes(x));
      return kept.length ? kept : ref.includedSchemas;
    });
  }, [schemaOptions, ref.includedSchemas]);

  useEffect(() => {
    if (!pending) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  const same = referenceId === targetId;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const swap = () => {
    setReferenceId(targetId);
    setTargetId(referenceId);
  };

  const run = () => {
    setError(null);
    start(async () => {
      const r = await runComparison({ referenceId, targetId, schemas, excludeTables, categories });
      if (!r.ok) return setError(r.error);
      router.push(`/comparisons/${r.id}`);
    });
  };

  const option = (c: PublicConnection) => (
    <option key={c.id} value={c.id}>
      {c.name} · {c.environment}
    </option>
  );

  return (
    <form
      className="mx-auto grid max-w-3xl gap-6 p-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (!same) run();
      }}
    >
      <Card className="p-5">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Field label="Reference: the expected definition" htmlFor="reference">
            <Select id="reference" value={referenceId} onChange={(e) => setReferenceId(e.target.value)} disabled={pending}>
              {connections.map(option)}
            </Select>
          </Field>
          <button
            type="button"
            onClick={swap}
            disabled={pending}
            className="mb-0.5 grid h-9 w-9 place-items-center rounded-md border border-border text-muted hover:bg-surface-2 hover:text-text"
            aria-label="Swap reference and target"
            title="Swap reference and target"
          >
            <ArrowLeftRight size={16} />
          </button>
          <Field label="Target: the environment being inspected" htmlFor="target" error={same ? "Choose a different connection from the reference." : undefined}>
            <Select id="target" value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={pending} aria-invalid={same || undefined}>
              {connections.map(option)}
            </Select>
          </Field>
        </div>

        {!same && tgt && (
          <div className="mt-4 rounded-md border border-border bg-bg px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{ref.name}</span>
              <EnvBadge environment={ref.environment} />
              <ArrowRight size={14} className="text-muted" aria-hidden />
              <span className="font-medium">{tgt.name}</span>
              <EnvBadge environment={tgt.environment} />
            </div>
            <p className="mt-1.5 text-muted">
              Driftly checks <span className="text-text">{tgt.name}</span> against <span className="text-text">{ref.name}</span>.
              Something in {ref.name} but not in {tgt.name} is <span className="text-missing">Missing</span>; something only in{" "}
              {tgt.name} is <span className="text-extra">Extra</span>.
            </p>
          </div>
        )}
      </Card>

      <Card className="grid gap-5 p-5">
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted">Schemas to compare</legend>
          <div className="flex flex-wrap gap-2">
            {schemaOptions.map((s) => {
              const on = schemas.includes(s);
              return (
                <label
                  key={s}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-sm",
                    on ? "border-accent/60 bg-accent/10" : "border-border text-muted",
                  )}
                >
                  <input type="checkbox" className="accent-[var(--accent)]" checked={on} onChange={() => setSchemas(toggle(schemas, s))} disabled={pending} />
                  {s}
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted/80">From the included schemas of both connections. Edit a connection to add more.</p>
        </fieldset>

        <Field label="Exclude tables (optional)" htmlFor="exclude" hint="Comma-separated. Use table or schema.table, e.g. audit_logs, public.sessions">
          <Input id="exclude" className="font-mono" value={excludeTables} onChange={(e) => setExcludeTables(e.target.value)} disabled={pending} />
        </Field>

        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted">Objects to compare (schemas and tables are always included)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-[var(--accent)]"
                  checked={categories.includes(c.id)}
                  onChange={() => setCategories(toggle(categories, c.id))}
                  disabled={pending}
                />
                <span>
                  {c.label} <span className="text-xs text-muted">· {c.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {pending && (
          <p role="status" className="text-sm text-muted">
            Reading metadata from both databases and comparing… {elapsed > 0 && `${elapsed}s`}
          </p>
        )}
        <Button type="submit" disabled={pending || same || !schemas.length}>
          {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
          Run comparison
        </Button>
      </div>
    </form>
  );
}
