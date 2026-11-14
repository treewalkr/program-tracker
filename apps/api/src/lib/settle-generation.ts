import { and, eq } from "drizzle-orm";
import { db, aiGenerations, type AiGenerationRow } from "@pt/db";
import { fixDraftRoles, type AiProgramDraft, type GenerationStatus, type SlotChange } from "@pt/shared";
import type { LlmOutcome } from "../ai/llm";
import { loadRoleLabels, roleHintsFor } from "./role-labels";

const RATIONALE_MAX = 4000;

/**
 * Code checks on a draft's roles: a missing, unknown or archived label →
 * suggestRole; more than one Primary in a session → a note at the end of the
 * rationale (left for the trainer to decide).
 */
export async function checkDraftRoles(trainerId: string, draft: AiProgramDraft): Promise<AiProgramDraft> {
  const ids = [...new Set(draft.weeks.flatMap((w) => w.sessions.flatMap((s) => (s.exercises ?? []).map((e) => e.exerciseId).filter((id): id is string => !!id))))];
  const [labels, hints] = await Promise.all([loadRoleLabels(trainerId), roleHintsFor(ids)]);
  const { draft: fixed, notes } = fixDraftRoles(draft, labels, hints);
  if (!notes.length) return fixed;
  const note = `\n\nRole check: ${notes.join(" ")}`;
  if (fixed.rationale.includes(note.trim())) return fixed; // a revision kept it
  return { ...fixed, rationale: (fixed.rationale.slice(0, RATIONALE_MAX - note.length) + note).slice(0, RATIONALE_MAX) };
}

/**
 * Write a draft call's outcome onto its pending generation. Only a row still
 * pending is touched — a cancel that landed mid-call wins, and that row comes
 * back unchanged with 200. `discardedChanges` (scoped proposal builds) is
 * stored with a validated draft. Roles are checked first (checkDraftRoles).
 */
export async function settleGeneration(
  id: string,
  out: LlmOutcome<AiProgramDraft>,
  extra: { discardedChanges?: SlotChange[] } = {}
): Promise<{ code: 200 | 201 | 502; row: AiGenerationRow }> {
  if (out.ok) {
    const [gen] = await db.select({ trainerId: aiGenerations.trainerId }).from(aiGenerations).where(eq(aiGenerations.id, id));
    if (gen) out = { ...out, data: await checkDraftRoles(gen.trainerId, out.data) };
  }
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
