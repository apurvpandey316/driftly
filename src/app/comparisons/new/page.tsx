import { PageHeader, EmptyState } from "@/components/page-header";
import { LinkButton } from "@/components/button";
import { listConnections } from "@/lib/connections";
import { ComparisonForm } from "./comparison-form";

export const dynamic = "force-dynamic";
// Scans run inside the runComparison server action, which inherits this page's limit.
// 300s is the most Vercel's Hobby plan allows; raise it (up to 800) on Pro for very large schemas.
export const maxDuration = 300;

export default async function NewComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; target?: string }>;
}) {
  const { reference, target } = await searchParams;
  const all = await listConnections();
  const usable = all.filter((c) => !c.disabled);

  return (
    <>
      <PageHeader
        title="New Comparison"
        description="Compare the structure of two databases. Nothing is written to either of them."
      />
      {usable.length < 2 ? (
        <EmptyState
          title="Add two connections first"
          body={
            all.length >= 2
              ? "A comparison needs two enabled connections. Enable one on the Connections page."
              : "A comparison needs two different connections, for example Development and Production."
          }
          action={<LinkButton href="/connections/new">Add connection</LinkButton>}
        />
      ) : (
        <ComparisonForm connections={usable} initialReference={reference} initialTarget={target} />
      )}
    </>
  );
}
