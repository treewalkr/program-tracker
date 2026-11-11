import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, aiGenerations, chatMessages, type AiGenerationRow, type ChatMessageRow } from "@pt/db";
import {
  AiProgramDraft,
  applyDraftEdit,
  DraftEditError,
  DraftEditOps,
  draftEditNote,
  draftEditRevisionMessage,
  type DraftEditOp,
} from "@pt/shared";
import { loadRoleLabels } from "./role-labels";

export type DraftEditSaveResult =
  | { ok: false; status: 404 | 409 | 422; error: string; issues?: unknown }
  | { ok: true; generation: AiGenerationRow; message: ChatMessageRow; undo: DraftEditOp[] };

/** Version number of a generation: its place in the revision chain, root = v1. */
async function versionOf(gen: AiGenerationRow): Promise<number> {
  let n = 1;
  let parentId = gen.parentGenerationId;
  while (parentId && n < 500) {
    const [p] = await db
      .select({ parentGenerationId: aiGenerations.parentGenerationId })
      .from(aiGenerations)
      .where(eq(aiGenerations.id, parentId));
    if (!p) break;
    n++;
    parentId = p.parentGenerationId;
  }
  return n;
}

/**
 * Save a trainer's hand edit (move, superset, move to session, undo) as the
 * next version of a draft — no AI call. The ops are replayed here on the
 * stored draft; a client-sent draft is never trusted. The change list is
 * written to the chat as an "edit" note, so the next chat answer or Build
 * knows the trainer changed the draft on purpose.
 */
export async function saveDraftEdit(parentId: string, rawOps: unknown): Promise<DraftEditSaveResult> {
  const [parent] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, parentId));
  if (!parent) return { ok: false, status: 404, error: "generation not found" };
  if (parent.status !== "validated" || !parent.draft) {
    return { ok: false, status: 409, error: `generation is ${parent.status}, not validated` };
  }
  if (parent.kind === "week") {
    return { ok: false, status: 409, error: "week drafts can't be edited by hand" };
  }

  const [child] = await db
    .select({ status: aiGenerations.status })
    .from(aiGenerations)
    .where(and(eq(aiGenerations.parentGenerationId, parent.id), inArray(aiGenerations.status, ["pending", "validated"])));
  if (child?.status === "pending") {
    return { ok: false, status: 409, error: "a revision is already running for this generation" };
  }
  if (child) return { ok: false, status: 409, error: "only the latest version can be edited" };

  const parsed = DraftEditOps.safeParse(rawOps);
  if (!parsed.success) {
    return { ok: false, status: 422, error: "invalid edit", issues: z.treeifyError(parsed.error) };
  }

  let edit: ReturnType<typeof applyDraftEdit>;
  try {
    edit = applyDraftEdit(parent.draft, parsed.data, await loadRoleLabels(parent.trainerId));
  } catch (err) {
    if (err instanceof DraftEditError) return { ok: false, status: 422, error: err.message };
    throw err;
  }
  if (!edit.changed) return { ok: false, status: 422, error: "the draft is unchanged" };
  const valid = AiProgramDraft.safeParse(edit.draft);
  if (!valid.success) {
    return { ok: false, status: 422, error: "the edited draft is invalid", issues: z.treeifyError(valid.error) };
  }

  const version = (await versionOf(parent)) + 1;
  return db.transaction(async (tx) => {
    const [generation] = await tx
      .insert(aiGenerations)
      .values({
        trainerId: parent.trainerId,
        clientId: parent.clientId,
        basedOnProgramId: parent.basedOnProgramId,
        kind: parent.kind,
        targetWeek: parent.targetWeek,
        direction: parent.direction,
        providerId: parent.providerId,
        model: parent.model,
        effort: parent.effort,
        status: "validated",
        draft: valid.data,
        parentGenerationId: parent.id,
        revisionMessage: draftEditRevisionMessage(edit.changes),
        manualEdit: true,
        exampleProgramIds: parent.exampleProgramIds ?? [],
      })
      .returning();
    const [message] = await tx
      .insert(chatMessages)
      .values({
        trainerId: parent.trainerId,
        clientId: parent.clientId,
        role: "trainer",
        kind: "edit",
        content: draftEditNote(version, edit.changes),
        generationId: generation.id,
      })
      .returning();
    return { ok: true as const, generation, message, undo: [edit.inverse] };
  });
}
