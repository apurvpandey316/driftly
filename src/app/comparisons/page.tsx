import { PageHeader, EmptyState } from "@/components/page-header";
import { LinkButton } from "@/components/button";

export default function ComparisonsPage() {
  return (
    <>
      <PageHeader
        title="Comparisons"
        description="Saved scans between a reference and a target database."
        action={<LinkButton href="/comparisons/new">New Comparison</LinkButton>}
      />
      <EmptyState title="No comparisons yet" body="Run your first comparison to see its results here." />
    </>
  );
}
