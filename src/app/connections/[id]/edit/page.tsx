import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getConnection } from "@/lib/connections";
import { ConnectionForm } from "../../connection-form";

export const dynamic = "force-dynamic";

export default async function EditConnectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const connection = await getConnection(id);
  if (!connection) notFound();

  return (
    <>
      <PageHeader title={`Edit ${connection.name}`} description="Update connection details or rotate the password." />
      <ConnectionForm initial={connection} />
    </>
  );
}
