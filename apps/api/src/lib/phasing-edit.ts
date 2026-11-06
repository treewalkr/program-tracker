import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, aiGenerations, type AiGenerationRow } from "@pt/db";
import { Phasing } from "@pt/shared";

/** JSON with object keys sorted — jsonb does not keep key order, so compare canonically. */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val
  );

/** History label for a hand-edited block plan. */
export const PHASING_EDIT_MESSAGE = "Block plan edited by you";

export type PhasingEditResult =
  | { ok: false; status: 404 | 409 | 422; error: string; issues?: unknown }
  | { ok: true; generation: AiGenerationRow };

/**
 * Save a trainer-edited block plan as the next version of a draft — no AI call.
 * The child copies the parent's draft with only `phasing` replaced, so the
 * version chain, history and change lists stay truthful.
 */
export async function savePhasingEdit(parentId: string, rawPhasing: unknown): Promise<PhasingEditResult> {
  const [parent] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, parentId));
  if (!parent) return { ok: false, status: 404, error: "generation not found" };
  if (parent.status !== "validated" || !parent.draft) {
    return { ok: false, status: 409, error: `generation is ${parent.status}, not validated` };
  }
  if (parent.kind === "week") {
    return { ok: false, status: 409, error: "week drafts follow the block's plan" };
  }

  const parsed = Phasing.safeParse(rawPhasing);
  if (!parsed.success) {
    return { ok: false, status: 422, error: "invalid phasing document", issues: z.treeifyError(parsed.error) };
  }
  if (canon(parsed.data) === canon(parent.draft.phasing ?? null)) {
    return { ok: false, status: 422, error: "phasing is unchanged" };
  }

  const [pendingChild] = await db
    .select()
    .from(aiGenerations)
    .where(and(eq(aiGenerations.parentGenerationId, parent.id), eq(aiGenerations.status, "pending")));
  if (pendingChild) {
    return { ok: false, status: 409, error: "a revision is already running for this generation" };
  }

  const [child] = await db
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
      draft: { ...parent.draft, phasing: parsed.data },
      parentGenerationId: parent.id,
      revisionMessage: PHASING_EDIT_MESSAGE,
      manualEdit: true,
      exampleProgramIds: parent.exampleProgramIds ?? [],
    })
    .returning();
  return { ok: true, generation: child };
}
