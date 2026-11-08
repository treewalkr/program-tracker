import { and, eq } from "drizzle-orm";
import { db, aiGenerations, type AiGenerationRow } from "@pt/db";
import type { AiProgramDraft, GenerationStatus, SlotChange } from "@pt/shared";
import type { LlmOutcome } from "../ai/llm";

/**
 * Write a draft call's outcome onto its pending generation. Only a row still
 * pending is touched — a cancel that landed mid-call wins, and that row comes
 * back unchanged with 200. `discardedChanges` (scoped proposal builds) is
 * stored with a validated draft.
 */
export async function settleGeneration(
  id: string,
  out: LlmOutcome<AiProgramDraft>,
  extra: { discardedChanges?: SlotChange[] } = {}
): Promise<{ code: 200 | 201 | 502; row: AiGenerationRow }> {
  const set: { status: GenerationStatus; draft?: AiProgramDraft; error: string | null; discardedChanges?: SlotChange[] } = out.ok
    ? { status: "validated", draft: out.data, error: null, ...(extra.discardedChanges ? { discardedChanges: extra.discardedChanges } : {}) }
    : out.kind === "provider"
      ? { status: "failed_provider", error: out.error.message }
      : { status: "failed_validation", error: out.kind === "validation" ? out.error : null };
  const [updated] = await db
    .update(aiGenerations)
    .set(set)
    .where(and(eq(aiGenerations.id, id), eq(aiGenerations.status, "pending")))
    .returning();
  if (!updated) {
    const [row] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, id));
    return { code: 200, row };
  }
  return { code: out.ok ? 201 : 502, row: updated };
}
