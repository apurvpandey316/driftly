"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, CircleSlash, Loader2, XCircle, CircleDashed } from "lucide-react";
import type { PublicConnection } from "@/lib/connections";
import { Card, EnvBadge, timeAgo } from "@/components/ui";
import { cn } from "@/lib/utils";
import { deleteConnection, setDisabled, testSaved } from "./actions";

function Status({ c }: { c: PublicConnection }) {
  // Icon + text, never colour alone.
  if (c.disabled)
    return (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <CircleSlash size={14} aria-hidden /> Disabled
      </span>
    );
  if (c.lastTestOk === true)
    return (
      <span className="inline-flex items-center gap-1.5 text-ok">
        <CheckCircle2 size={14} aria-hidden /> Connected
        <span className="text-muted">· {timeAgo(c.lastTestedAt)}</span>
      </span>
    );
  if (c.lastTestOk === false)
    return (
      <span className="inline-flex items-center gap-1.5 text-danger">
        <XCircle size={14} aria-hidden /> Test failed
        <span className="text-muted">· {timeAgo(c.lastTestedAt)}</span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <CircleDashed size={14} aria-hidden /> Not tested
    </span>
  );
}

const action =
  "rounded px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text disabled:opacity-50 disabled:hover:bg-transparent";

function Row({ c }: { c: PublicConnection }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"test" | "toggle" | "delete" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const run = (kind: "test" | "toggle" | "delete", fn: () => Promise<void>) => {
    setBusy(kind);
    setMessage(null);
    start(async () => {
      await fn();
      setBusy(null);
    });
  };

  const retest = () =>
    run("test", async () => {
      const r = await testSaved(c.id);
      if (!r.ok) return setMessage({ tone: "error", text: r.error });
      const t = r.result;
      if (t.error) setMessage({ tone: "error", text: t.error });
      else if (!t.ok)
        setMessage({
          tone: "error",
          text: [
            t.missingSchemas.length && `Schemas not found: ${t.missingSchemas.join(", ")}.`,
            t.schemasWithoutUsage.length && `No access to: ${t.schemasWithoutUsage.join(", ")}.`,
          ]
            .filter(Boolean)
            .join(" "),
        });
      else setMessage({ tone: "ok", text: `Connected · PostgreSQL ${t.serverVersion}` });
    });

  const toggle = () =>
    run("toggle", async () => {
      const r = await setDisabled(c.id, !c.disabled);
      if (!r.ok) setMessage({ tone: "error", text: r.error });
    });

  const remove = () =>
    run("delete", async () => {
      const r = await deleteConnection(c.id);
      setConfirming(false);
      if (!r.ok) setMessage({ tone: "error", text: r.error });
    });

  return (
    <li className={cn("px-4 py-3", c.disabled && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-48 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{c.name}</span>
            <EnvBadge environment={c.environment} />
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-muted">
            {c.username}@{c.host}:{c.port}/{c.database}
          </div>
        </div>
        <div className="w-40 text-xs text-muted">
          <div className="capitalize">{c.provider === "postgresql" ? "PostgreSQL" : "Supabase"}</div>
          <div className="truncate font-mono" title={c.includedSchemas.join(", ")}>
            {c.includedSchemas.join(", ")}
          </div>
        </div>
        <div className="w-52 text-xs">
          <Status c={c} />
        </div>
        <div className="flex items-center gap-1">
          {confirming ? (
            <>
              <span className="mr-1 text-xs text-danger">Delete permanently?</span>
              <button className={cn(action, "text-danger")} onClick={remove} disabled={pending}>
                {busy === "delete" ? <Loader2 size={14} className="animate-spin" /> : "Delete"}
              </button>
              <button className={action} onClick={() => setConfirming(false)} disabled={pending}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className={action} onClick={retest} disabled={pending || c.disabled}>
                {busy === "test" ? <Loader2 size={14} className="animate-spin" aria-label="Testing" /> : "Retest"}
              </button>
              {!c.disabled && (
                <Link className={action} href={`/connections/${c.id}/schema`}>
                  Schema
                </Link>
              )}
              <Link className={action} href={`/connections/${c.id}/edit`}>
                Edit
              </Link>
              <button className={action} onClick={toggle} disabled={pending}>
                {c.disabled ? "Enable" : "Disable"}
              </button>
              <button className={action} onClick={() => setConfirming(true)} disabled={pending}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {message && (
        <p role="status" className={cn("mt-2 text-xs", message.tone === "ok" ? "text-ok" : "text-danger")}>
          {message.text}
        </p>
      )}
    </li>
  );
}

export function ConnectionsTable({ items }: { items: PublicConnection[] }) {
  return (
    <Card>
      <ul className="divide-y divide-border">
        {items.map((c) => (
          <Row key={c.id} c={c} />
        ))}
      </ul>
    </Card>
  );
}
