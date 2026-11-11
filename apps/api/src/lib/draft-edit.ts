import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, aiGenerations, chatMessages, type AiGenerationRow, type ChatMessageRow } from "@pt/db";
import {
  AiProgramDraft,
  applyDraftEdit,
  canonicalDraft,
  DraftEditError,
  DraftEditOps,
  draftEditNote,
  draftEditRevisionMessage,
  foldDraftEdit,
  sameDraft,
  type DraftEditOp,
} from "@pt/shared";
import { loadRoleLabels } from "./role-labels";

export type DraftEditSaveResult =
  | { ok: false; status: 404 | 409 | 422; error: string; issues?: unknown }
  | {
      ok: true;
      generation: AiGenerationRow;
      message: ChatMessageRow;
      undo: DraftEditOp[];
      /** True when the edit folded into the target version (updated in place), false for a new version. */
      folded: boolean;
      /** Version number of `generation` (root = v1). */
      version: number;
      /** This edit's own changes (the label and note accumulate). */
      changes: string[];
    };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Version number of a generation: its place in the revision chain, root = v1. */
async function versionOf(q: Tx, gen: AiGenerationRow): Promise<number> {
  let n = 1;
  let parentId = gen.parentGenerationId;
  while (parentId && n < 500) {
    const [p] = await q
      .select({ parentGenerationId: aiGenerations.parentGenerationId })
      .from(aiGenerations)
      .where(eq(aiGenerations.id, parentId));
    if (!p) break;
    n++;
    parentId = p.parentGenerationId;
  }
  return n;
}

class Refused {
  constructor(readonly res: Extract<DraftEditSaveResult, { ok: false }>) {}
}

/**
 * Save a trainer's hand edit (move, superset, move to session, undo) — no AI
 * call. The ops are replayed here on the stored draft; a client-sent draft is
 * never trusted. The change list is written to the chat as an "edit" note, so
 * the next chat answer or Build knows the trainer changed the draft on purpose.
 *
 * Consecutive hand edits fold into one version: when the target is the latest
 * version and itself a hand-edit version (with an edit note — not a block-plan
 * edit) and no unbuilt proposal targets it, the target is updated in place.
 * Its label accumulates, and its note is rewritten while it is the newest chat
 * line, else a "continued" note is added. Otherwise a new child version is
 * saved. The target row is locked, so two quick edits apply one after the other.
 */
export async function saveDraftEdit(targetId: string, rawOps: unknown): Promise<DraftEditSaveResult> {
  const parsed = DraftEditOps.safeParse(rawOps);
  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx.select().from(aiGenerations).where(eq(aiGenerations.id, targetId)).for("update");
      if (!target) throw new Refused({ ok: false, status: 404, error: "generation not found" });
      if (target.status !== "validated" || !target.draft) {
        throw new Refused({ ok: false, status: 409, error: `generation is ${target.status}, not validated` });
      }

      const [child] = await tx
        .select({ status: aiGenerations.status })
        .from(aiGenerations)
        .where(and(eq(aiGenerations.parentGenerationId, target.id), inArray(aiGenerations.status, ["pending", "validated"])));
      if (child?.status === "pending") {
        throw new Refused({ ok: false, status: 409, error: "a revision is already running for this generation" });
      }
      if (child) throw new Refused({ ok: false, status: 409, error: "only the latest version can be edited" });

      if (!parsed.success) {
        throw new Refused({ ok: false, status: 422, error: "invalid edit", issues: z.treeifyError(parsed.error) });
      }

      const labels = await loadRoleLabels(target.trainerId);
      let edit: ReturnType<typeof applyDraftEdit>;
      try {
        edit = applyDraftEdit(target.draft, parsed.data, labels, { keepOrder: target.trainerOrder });
      } catch (err) {
        if (err instanceof DraftEditError) throw new Refused({ ok: false, status: 422, error: err.message });
        throw err;
      }
      if (!edit.changed) throw new Refused({ ok: false, status: 422, error: "the draft is unchanged" });
      const valid = AiProgramDraft.safeParse(edit.draft);
      if (!valid.success) {
        throw new Refused({
          ok: false,
          status: 422,
          error: "the edited draft is invalid",
          issues: z.treeifyError(valid.error),
        });
      }

      const version = await versionOf(tx, target);
      const fold = await foldable(tx, target);
      if (fold) {
        // The version before the hand edits: does the folded draft show the same?
        const [parent] = target.parentGenerationId
          ? await tx.select().from(aiGenerations).where(eq(aiGenerations.id, target.parentGenerationId))
          : [];
        const same =
          !!parent?.draft &&
          sameDraft(
            canonicalDraft(parent.draft, labels, { keepOrder: parent.trainerOrder }),
            canonicalDraft(valid.data, labels, { keepOrder: true })
          );
        const [last] = await tx
          .select()
          .from(chatMessages)
          .where(and(eq(chatMessages.clientId, target.clientId), isNull(chatMessages.hiddenAt)))
          .orderBy(desc(chatMessages.createdAt))
          .limit(1);
        const ownNote = last?.kind === "edit" && last.generationId === target.id ? last : null;
        const next = foldDraftEdit({
          version,
          revisionMessage: target.revisionMessage,
          lastNote: ownNote?.content ?? null,
          changes: edit.changes,
          same,
        });
        const [generation] = await tx
          .update(aiGenerations)
          .set({ draft: valid.data, revisionMessage: next.revisionMessage, trainerOrder: true })
          .where(eq(aiGenerations.id, target.id))
          .returning();
        const [message] = ownNote
          ? await tx.update(chatMessages).set({ content: next.note }).where(eq(chatMessages.id, ownNote.id)).returning()
          : await tx
              .insert(chatMessages)
              .values({
                trainerId: target.trainerId,
                clientId: target.clientId,
                role: "trainer",
                kind: "edit",
                content: next.note,
                generationId: target.id,
              })
              .returning();
        return { ok: true as const, generation, message, undo: [edit.inverse], folded: true, version, changes: edit.changes };
      }

      const [generation] = await tx
        .insert(aiGenerations)
        .values({
          trainerId: target.trainerId,
          clientId: target.clientId,
          basedOnProgramId: target.basedOnProgramId,
          kind: target.kind,
          targetWeek: target.targetWeek,
          direction: target.direction,
          providerId: target.providerId,
          model: target.model,
          effort: target.effort,
          status: "validated",
          draft: valid.data,
          parentGenerationId: target.id,
          revisionMessage: draftEditRevisionMessage(edit.changes),
          manualEdit: true,
          // From now on the exercise order is the trainer's.
          trainerOrder: true,
          exampleProgramIds: target.exampleProgramIds ?? [],
        })
        .returning();
      const [message] = await tx
        .insert(chatMessages)
        .values({
          trainerId: target.trainerId,
          clientId: target.clientId,
          role: "trainer",
          kind: "edit",
          content: draftEditNote(version + 1, edit.changes),
          generationId: generation.id,
        })
        .returning();
      return {
        ok: true as const,
        generation,
        message,
        undo: [edit.inverse],
        folded: false,
        version: version + 1,
        changes: edit.changes,
      };
    });
  } catch (err) {
    if (err instanceof Refused) return err.res;
    throw err;
  }
}

/**
 * A hand-edit version from the draft chat (manual, with an edit note — block
 * plan edits have none) that no open proposal targets: a proposal was made
 * against the draft as it was, so the next edit must not change it under it.
 */
async function foldable(tx: Tx, target: AiGenerationRow): Promise<boolean> {
  if (!target.manualEdit) return false;
  const [note] = await tx
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(and(eq(chatMessages.generationId, target.id), eq(chatMessages.kind, "edit")))
    .limit(1);
  if (!note) return false;
  const [proposal] = await tx
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.clientId, target.clientId),
        eq(chatMessages.kind, "proposal"),
        isNull(chatMessages.hiddenAt),
        sql`${chatMessages.proposal}->>'parentGenerationId' = ${target.id}`,
        sql`${chatMessages.proposal}->>'builtGenerationId' is null`
      )
    )
    .limit(1);
  return !proposal;
}
