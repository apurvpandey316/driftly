import { PageHeader, EmptyState } from "@/components/page-header";
import { LinkButton } from "@/components/button";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Health from your most recent completed scans."
        action={<LinkButton href="/comparisons/new">New Comparison</LinkButton>}
      />
      <EmptyState
        title="No databases connected yet"
        body="Connect your first database, then run a comparison to see differences between environments."
        action={<LinkButton href="/connections">Add connection</LinkButton>}
      />
    </>
  );
}
