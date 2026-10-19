import { PageHeader, EmptyState } from "@/components/page-header";

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="Drift History" description="How differences appear and disappear across scans." />
      <EmptyState title="Coming in Phase 2" body="Scan timelines and snapshot comparisons arrive with monitoring." />
    </>
  );
}
