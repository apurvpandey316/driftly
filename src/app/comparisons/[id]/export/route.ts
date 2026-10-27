import { toCSV, toJSON } from "@/engine";
import { getScanResult } from "@/lib/scans";

export const dynamic = "force-dynamic";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await getScanResult(id);
  if (!loaded) return new Response("Not found", { status: 404 });

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const date = (loaded.result.finishedAt || new Date().toISOString()).slice(0, 10);
  const name = `driftly-${slug(loaded.scan.reference.name)}-to-${slug(loaded.scan.target.name)}-${date}.${format}`;
  // Exports include the reference -> target labels as they were when the scan ran.
  const body =
    format === "csv"
      ? toCSV(loaded.result)
      : toJSON({ ...loaded.result, connections: loaded.scan } as typeof loaded.result);

  return new Response(body, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
