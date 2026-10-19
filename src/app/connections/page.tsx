import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/button";

export default function ConnectionsPage() {
  return (
    <>
      <PageHeader
        title="Connections"
        description="Databases Driftly can inspect with read-only credentials."
        action={<Button disabled>Add connection</Button>}
      />
      <EmptyState
        title="No connections"
        body="Add a PostgreSQL or Supabase database. Driftly only reads schema metadata and never writes to it."
      />
    </>
  );
}
