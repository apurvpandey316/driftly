import { PageHeader, EmptyState } from "@/components/page-header";

export default function NewComparisonPage() {
  return (
    <>
      <PageHeader
        title="New Comparison"
        description="The reference is the expected definition; the target is the environment being inspected."
      />
      <EmptyState title="Add two connections first" body="A comparison needs two different connections." />
    </>
  );
}
