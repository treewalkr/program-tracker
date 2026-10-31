import { db, aiGenerations, clients, programs } from "@pt/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  diffRowsToText,
  diffSources,
  aiDraftToDiffSource,
  programWeeksToDiffSource,
  type PreferenceSignal,
} from "@pt/shared";

export async function gatherPreferenceSignals(
  trainerId: string,
  clientId: string | null
): Promise<PreferenceSignal[]> {
  const whereClause = clientId
    ? and(eq(aiGenerations.trainerId, trainerId), eq(aiGenerations.clientId, clientId))
    : eq(aiGenerations.trainerId, trainerId);

  const rowsDesc = await db
    .select()
    .from(aiGenerations)
    .where(whereClause)
    .orderBy(desc(aiGenerations.createdAt))
    .limit(200);

  const rows = rowsDesc.reverse();
  if (rows.length === 0) return [];

  const trainerClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.trainerId, trainerId));
  const clientMap = new Map(trainerClients.map((c) => [c.id, c.name]));

  const programIds = [
    ...new Set(
      rows
        .map((r) => r.approvedProgramId)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const programRows = programIds.length
    ? await db.select().from(programs).where(inArray(programs.id, programIds))
    : [];
  const programMap = new Map(programRows.map((p) => [p.id, p]));

  const signals: PreferenceSignal[] = [];

  for (const row of rows) {
    const clientName = clientMap.get(row.clientId) ?? null;
    const at =
      typeof row.createdAt === "string"
        ? row.createdAt
        : row.createdAt.toISOString();

    if (row.instructions && row.instructions.trim().length > 0) {
      signals.push({
        kind: "instruction",
        clientName,
        at,
        text: row.instructions,
      });
    }

    if (row.revisionMessage && row.revisionMessage.trim().length > 0) {
      signals.push({
        kind: "revision",
        clientName,
        at,
        text: row.revisionMessage,
      });
    }

    if (row.rejectReason && row.rejectReason.trim().length > 0) {
      signals.push({
        kind: "reject",
        clientName,
        at,
        text: row.rejectReason,
      });
    }

    if (row.approvedProgramId && row.draft) {
      const prog = programMap.get(row.approvedProgramId);
      if (prog && prog.sessions) {
        const diffText = diffRowsToText(
          diffSources(
            aiDraftToDiffSource(row.draft),
            programWeeksToDiffSource(prog.sessions)
          )
        );
        if (diffText.length > 0) {
          signals.push({
            kind: "approved-diff",
            clientName,
            at,
            text: diffText,
          });
        }
      }
    }
  }

  return signals;
}
