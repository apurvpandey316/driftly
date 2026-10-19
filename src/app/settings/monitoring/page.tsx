import { PageHeader, EmptyState } from "@/components/page-header";

export default function MonitoringPage() {
  return (
    <>
      <PageHeader title="Alerts & Monitoring" description="Scheduled scans and notifications." />
      <EmptyState title="Coming in Phase 2" body="Hourly, daily or weekly scans with email alerts." />
    </>
  );
}
