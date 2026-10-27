import { PageHeader } from "@/components/page-header";
import { ConnectionForm } from "../connection-form";

export default function NewConnectionPage() {
  return (
    <>
      <PageHeader
        title="Add connection"
        description="Driftly reads schema metadata only. It never writes to this database or reads its rows."
      />
      <ConnectionForm />
    </>
  );
}
