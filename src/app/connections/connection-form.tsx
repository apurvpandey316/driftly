"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Plus, X, XCircle } from "lucide-react";
import type { ConnectionTestResult } from "@/engine";
import type { PublicConnection } from "@/lib/connections";
import { Button } from "@/components/button";
import { Card, Field, Input, Select } from "@/components/ui";
import { createConnection, testDraft, updateConnection, type ConnectionInput, type FieldErrors } from "./actions";

type Form = Omit<ConnectionInput, "port"> & { port: string };

const EMPTY: Form = {
  name: "",
  provider: "postgresql",
  environment: "development",
  host: "",
  port: "5432",
  database: "postgres",
  username: "",
  password: "",
  sslMode: "disable",
  includedSchemas: ["public"],
};

/** Fills fields from a pasted postgres:// URL. The URL itself is never stored. */
function parseUrl(raw: string): Partial<Form> | null {
  const trimmed = raw.trim();
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) return null;
  try {
    // Browsers parse non-http schemes inconsistently, so parse it as http.
    const u = new URL(trimmed.replace(/^postgres(ql)?:\/\//i, "http://"));
    if (!u.hostname) return null;
    const supabase = /supabase\.(co|com)$/.test(u.hostname);
    const ssl = u.searchParams.get("sslmode");
    return {
      host: u.hostname,
      port: u.port || "5432",
      database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      ...(supabase ? { provider: "supabase" } : {}),
      sslMode: ssl === "disable" ? "disable" : ssl === "verify-full" ? "verify-full" : ssl || supabase ? "require" : "disable",
    };
  } catch {
    return null;
  }
}

export function ConnectionForm({ initial }: { initial?: PublicConnection }) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [form, setForm] = useState<Form>(() =>
    initial
      ? {
          name: initial.name,
          provider: initial.provider,
          environment: initial.environment,
          host: initial.host,
          port: String(initial.port),
          database: initial.database,
          username: initial.username,
          password: "",
          sslMode: initial.sslMode,
          includedSchemas: initial.includedSchemas,
        }
      : EMPTY,
  );
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [schemaDraft, setSchemaDraft] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [test, setTest] = useState<{ key: string; result: ConnectionTestResult } | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"test" | "save" | null>(null);

  const key = useMemo(() => JSON.stringify(form), [form]);
  const testIsCurrent = test?.key === key;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const applyUrl = () => {
    const parsed = parseUrl(url);
    if (!parsed) return setUrlError("That doesn't look like a postgresql:// connection URL.");
    setForm((f) => ({ ...f, ...parsed }));
    setErrors({});
    setUrl(""); // don't keep a credential-bearing URL around
    setUrlError(null);
  };

  const addSchema = (name: string) => {
    const n = name.trim();
    if (n && !form.includedSchemas.includes(n)) set("includedSchemas", [...form.includedSchemas, n]);
    setSchemaDraft("");
  };

  const runTest = () => {
    setBusy("test");
    setFormError(null);
    start(async () => {
      const r = await testDraft(form, initial?.id);
      setBusy(null);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.error);
        setTest(null);
        return;
      }
      setTest({ key, result: r.result });
    });
  };

  const save = () => {
    setBusy("save");
    setFormError(null);
    const tested = testIsCurrent ? test!.result.ok : undefined;
    start(async () => {
      const r = initial ? await updateConnection(initial.id, form, tested) : await createConnection(form, tested);
      if (!r.ok) {
        setBusy(null);
        setErrors(r.fieldErrors ?? {});
        setFormError(r.error);
        return;
      }
      router.push("/connections");
      router.refresh();
    });
  };

  const inputProps = (k: keyof Form) => ({
    id: k,
    "aria-invalid": Boolean(errors[k]) || undefined,
    "aria-describedby": errors[k] ? `${k}-error` : undefined,
  });

  const r = testIsCurrent ? test!.result : null;
  const suggestions = r?.availableSchemas.filter((s) => !form.includedSchemas.includes(s)) ?? [];

  return (
    <form
      className="mx-auto grid max-w-3xl gap-6 p-8"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {!editing && (
        <Card className="p-4">
          <Field
            label="Quick fill from a connection URL (optional)"
            htmlFor="url"
            error={urlError ?? undefined}
            hint="Fills the fields below. The URL itself is not saved, and the password goes into the masked field."
          >
            <div className="flex gap-2">
              <Input
                id="url"
                type="password"
                autoComplete="off"
                placeholder="postgresql://user:password@host:5432/database"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyUrl();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={applyUrl} disabled={!url}>
                Fill
              </Button>
            </div>
          </Field>
        </Card>
      )}

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Connection name" htmlFor="name" error={errors.name} className="sm:col-span-2">
          <Input {...inputProps("name")} placeholder="e.g. Production" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Database provider" htmlFor="provider" error={errors.provider}>
          <Select
            {...inputProps("provider")}
            value={form.provider}
            onChange={(e) => {
              set("provider", e.target.value);
              if (e.target.value === "supabase" && form.sslMode === "disable") set("sslMode", "require");
            }}
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="supabase">Supabase</option>
          </Select>
        </Field>
        <Field label="Environment" htmlFor="environment" error={errors.environment}>
          <Select {...inputProps("environment")} value={form.environment} onChange={(e) => set("environment", e.target.value)}>
            <option value="development">Development</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
            <option value="custom">Custom</option>
          </Select>
        </Field>
        <Field
          label="Host"
          htmlFor="host"
          error={errors.host}
          className="sm:col-span-2"
          hint={form.provider === "supabase" ? "Use the Session pooler host from Supabase → Connect, e.g. aws-0-ap-south-1.pooler.supabase.com" : undefined}
        >
          <Input {...inputProps("host")} className="font-mono" placeholder="localhost" value={form.host} onChange={(e) => set("host", e.target.value)} />
        </Field>
        <Field label="Port" htmlFor="port" error={errors.port}>
          <Input {...inputProps("port")} className="font-mono" inputMode="numeric" value={form.port} onChange={(e) => set("port", e.target.value)} />
        </Field>
        <Field label="Database name" htmlFor="database" error={errors.database}>
          <Input {...inputProps("database")} className="font-mono" value={form.database} onChange={(e) => set("database", e.target.value)} />
        </Field>
        <Field
          label="Username"
          htmlFor="username"
          error={errors.username}
          hint={form.provider === "supabase" ? "For the pooler this looks like postgres.yourprojectref" : "A read-only user is recommended."}
        >
          <Input {...inputProps("username")} className="font-mono" autoComplete="off" value={form.username} onChange={(e) => set("username", e.target.value)} />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          error={errors.password}
          hint={editing ? "Leave blank to keep the saved password. Enter a new one to rotate it." : "Encrypted before it is stored. Never shown again."}
        >
          <Input
            {...inputProps("password")}
            type="password"
            autoComplete="new-password"
            placeholder={editing ? "••••••••  (saved)" : ""}
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
          />
        </Field>
        <Field label="SSL mode" htmlFor="sslMode" error={errors.sslMode}>
          <Select {...inputProps("sslMode")} value={form.sslMode} onChange={(e) => set("sslMode", e.target.value)}>
            <option value="disable">Disable (local only)</option>
            <option value="require">Require</option>
            <option value="verify-full">Verify full</option>
          </Select>
        </Field>
        <Field label="Included schemas" htmlFor="schemas" error={errors.includedSchemas} className="sm:col-span-2" hint="Press Enter to add. Only these schemas are compared.">
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-bg px-2 py-1.5">
            {form.includedSchemas.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-0.5 font-mono text-xs">
                {s}
                <button
                  type="button"
                  aria-label={`Remove schema ${s}`}
                  className="text-muted hover:text-text"
                  onClick={() => set("includedSchemas", form.includedSchemas.filter((x) => x !== s))}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <input
              id="schemas"
              className="min-w-24 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted/60"
              placeholder="add schema"
              value={schemaDraft}
              onChange={(e) => setSchemaDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addSchema(schemaDraft);
                }
              }}
              onBlur={() => schemaDraft && addSchema(schemaDraft)}
            />
          </div>
          {suggestions.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              Found in database:
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addSchema(s)}
                  className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-mono hover:text-text"
                >
                  <Plus size={11} aria-hidden /> {s}
                </button>
              ))}
            </div>
          )}
        </Field>
      </Card>

      {r && <TestResult r={r} />}
      {test && !testIsCurrent && <p className="text-xs text-muted">Fields changed since the last test. Test again to confirm.</p>}
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Link href="/connections" className="text-sm text-muted hover:text-text">
          Cancel
        </Link>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={runTest} disabled={pending}>
            {busy === "test" && <Loader2 size={14} className="animate-spin" aria-hidden />}
            Test connection
          </Button>
          <Button type="submit" disabled={pending}>
            {busy === "save" && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {editing ? "Save changes" : "Save connection"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function TestResult({ r }: { r: ConnectionTestResult }) {
  if (r.error)
    return (
      <Card role="status" className="flex gap-3 border-danger/40 p-4 text-sm">
        <XCircle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />
        <div>
          <p className="font-medium">Connection failed</p>
          <p className="mt-0.5 text-muted">{r.error}</p>
        </div>
      </Card>
    );
  return (
    <Card role="status" className={`p-4 text-sm ${r.ok ? "border-ok/40" : "border-missing/40"}`}>
      <div className="flex gap-3">
        {r.ok ? (
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" aria-hidden />
        ) : (
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-missing" aria-hidden />
        )}
        <div className="grid gap-1">
          <p className="font-medium">
            {r.ok ? "Connected" : "Connected, but some schemas can't be inspected"} · PostgreSQL {r.serverVersion}
          </p>
          {r.missingSchemas.length > 0 && (
            <p className="text-muted">
              Not found: <span className="font-mono">{r.missingSchemas.join(", ")}</span>
            </p>
          )}
          {r.schemasWithoutUsage.length > 0 && (
            <p className="text-muted">
              No access to: <span className="font-mono">{r.schemasWithoutUsage.join(", ")}</span>
            </p>
          )}
          {r.warnings.map((w) => (
            <p key={w} className="text-muted">
              <span className="text-missing">Note:</span> {w}
            </p>
          ))}
        </div>
      </div>
    </Card>
  );
}
