import { Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { LinkButton } from "@/components/button";
import { listConnections } from "@/lib/connections";
import { ConnectionsTable } from "./connections-table";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const items = await listConnections();
  const add = (
    <LinkButton href="/connections/new">
      <Plus size={16} aria-hidden /> Add connection
    </LinkButton>
  );

  return (
    <>
      <PageHeader title="Connections" description="Databases Driftly can inspect with read-only credentials." action={add} />
      {items.length === 0 ? (
        <EmptyState
          title="No connections yet"
          body="Add a PostgreSQL or Supabase database. Driftly only reads schema metadata and never writes to it."
          action={add}
        />
      ) : (
        <div className="p-8">
          <ConnectionsTable items={items} />
          {items.length === 1 && (
            <p className="mt-4 text-sm text-muted">Add one more connection to run your first comparison.</p>
          )}
        </div>
      )}
    </>
  );
}
