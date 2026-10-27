import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { acknowledgements } from "@/db/schema";
import { getWorkspaceId } from "./workspace";

export interface AckState {
  acknowledged: boolean;
  note: string | null;
  at: string;
}

/** Current review state per difference key for one reference → target pair (latest action wins). */
export async function getAcks(referenceId: string, targetId: string): Promise<Record<string, AckState>> {
  const workspaceId = await getWorkspaceId();
  const rows = await db
    .selectDistinctOn([acknowledgements.diffKey], {
      diffKey: acknowledgements.diffKey,
      status: acknowledgements.status,
      note: acknowledgements.note,
      createdAt: acknowledgements.createdAt,
    })
    .from(acknowledgements)
    .where(
      and(
        eq(acknowledgements.workspaceId, workspaceId),
        eq(acknowledgements.referenceConnectionId, referenceId),
        eq(acknowledgements.targetConnectionId, targetId),
      ),
    )
    .orderBy(asc(acknowledgements.diffKey), desc(acknowledgements.createdAt));
  const out: Record<string, AckState> = {};
  for (const r of rows) {
    if (r.status === "acknowledged") out[r.diffKey] = { acknowledged: true, note: r.note, at: r.createdAt.toISOString() };
  }
  return out;
}
