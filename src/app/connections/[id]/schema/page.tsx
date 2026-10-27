import Link from "next/link";
import { notFound } from "next/navigation";
import { XCircle } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { LinkButton } from "@/components/button";
import { Card } from "@/components/ui";
import { captureSnapshot } from "@/engine";
import { getConnection, getEngineConfig } from "@/lib/connections";
import { getScan } from "@/lib/scans";
import { SchemaExplorer, type Highlight } from "./schema-explorer";

export const dynamic = "force-dynamic";

export default async function SchemaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ table?: string; scan?: string }>;
}) {
  const { id } = await params;
  const { table, scan: scanId } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const connection = await getConnection(id);
  if (!connection) notFound();

  const description = `${connection.environment[0].toUpperCase()}${connection.environment.slice(1)} · read-only view of ${connection.database} · schemas ${connection.includedSchemas.join(", ")}`;

  if (connection.disabled) {
    return (
      <>
        <PageHeader title={connection.name} description={description} />
        <EmptyState
          title="This connection is disabled"
          body="Enable it on the Connections page to browse its schema."
          action={<LinkButton href="/connections">Go to Connections</LinkButton>}
        />
      </>
    );
  }

  const cfg = await getEngineConfig(id);
  const { snapshot, errors } = await captureSnapshot(cfg!.config, { schemas: connection.includedSchemas });

  // Optional comparison context: highlight objects that differ in a saved scan.
  let highlights: Highlight[] = [];
  let context: { id: string; label: string; side: "reference" | "target" } | null = null;
  if (scanId) {
    const scan = await getScan(scanId);
    const side = scan?.reference.id === id ? "reference" : scan?.target.id === id ? "target" : null;
    if (scan && side) {
      context = { id: scan.id, label: `${scan.reference.name} → ${scan.target.name}`, side };
      // Only objects that exist on this side can be highlighted.
      highlights = scan.differences
        .filter((d) => d.kind === "modified" || (side === "reference" ? d.kind === "missing" : d.kind === "extra"))
        .map((d) => ({ path: d.path, kind: d.kind, objectKind: d.objectKind, severity: d.severity, note: d.note }));
    }
  }

  return (
    <>
      <PageHeader
        title={`Schema · ${connection.name}`}
        description={description}
        action={
          <Link href="/connections" className="text-sm text-muted hover:text-text">
            ← Connections
          </Link>
        }
      />
      {!snapshot ? (
        <Card role="alert" className="m-8 flex gap-3 border-danger/40 p-4 text-sm">
          <XCircle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-medium">Couldn&apos;t read this database&apos;s schema.</p>
            <ul className="mt-1 text-muted">
              {errors.map((e) => (
                <li key={e.message} className="font-mono text-xs">
                  {e.message}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : (
        <SchemaExplorer
          connectionId={id}
          snapshot={snapshot}
          errors={errors}
          initialTable={table ?? null}
          highlights={highlights}
          context={context}
        />
      )}
    </>
  );
}
