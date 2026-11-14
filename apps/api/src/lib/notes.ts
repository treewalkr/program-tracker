import { and, eq } from "drizzle-orm";
import { db, aiGenerations, coachingRules, type CoachingRuleRow, type LlmFeedbackRow } from "@pt/db";
import { anchorText, draftWeek, rxLabel, type LlmReasonTag, type NoteAnchor, type NoteScope } from "@pt/shared";
import { bumpViolated, extractRule, providerOfCall } from "./coaching-rules";

/**
 * Detailed notes (§10): a critique pinned to one part of an output, with what
 * to do instead and whether it should apply again. A scope other than "once"
 * asks the model for a candidate rule — proposed only, never active.
 */

export const toNoteDto = (r: LlmFeedbackRow) => ({
  id: r.id,
  subjectKind: r.subjectKind as "chat_message" | "generation" | "client_message",
  subjectId: r.subjectId,
  signal: r.signal,
  anchor: r.anchor ?? null,
  anchorText: anchorText(r.anchor),
  comment: r.comment,
  correction: r.correction,
  scope: r.scope ?? "once",
  ruleId: r.ruleId,
  createdAt: r.createdAt.toISOString(),
});

export const toRuleDto = (r: CoachingRuleRow, clientName: string | null = null) => ({
  id: r.id,
  clientId: r.clientId,
  clientName,
  text: r.text,
  category: r.category,
  status: r.status,
  source: r.source,
  appliedCount: r.appliedCount,
  violatedCount: r.violatedCount,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** An active rule of this trainer, or null (the "this broke rule X" picker). */
export async function activeRuleOf(trainerId: string, ruleId: string): Promise<CoachingRuleRow | null> {
  const [rule] = await db
    .select()
    .from(coachingRules)
    .where(and(eq(coachingRules.id, ruleId), eq(coachingRules.trainerId, trainerId), eq(coachingRules.status, "active")));
  return rule ?? null;
}

/** What the AI wrote at the anchor, so extraction sees the case, not just the critique. */
export async function subjectTextAt(kind: string, id: string, anchor: NoteAnchor | null): Promise<string | null> {
  if (!anchor) return null;
  if (anchor.type === "text") return anchor.quote;
  if (kind !== "generation") return null;
  const [gen] = await db.select({ draft: aiGenerations.draft }).from(aiGenerations).where(eq(aiGenerations.id, id));
  const session = gen?.draft ? draftWeek(gen.draft, anchor.week).sessions[anchor.sessionIndex] : undefined;
  if (!session) return null;
  if (anchor.exerciseIndex == null) {
    return `${session.name}: ${session.exercises.map((e) => e.exerciseName ?? e.exerciseId).join(", ")}`;
  }
  const ex = session.exercises[anchor.exerciseIndex];
  return ex ? `${ex.exerciseName ?? ex.exerciseId} — ${rxLabel(ex.prescribedSets)}` : null;
}

/**
 * After a note (or a 👎 with "what instead") is stored: count the broken rule,
 * and propose a rule when the trainer said it should apply again.
 */
export async function afterNote(
  row: LlmFeedbackRow,
  opts: { trainerId: string; violatedRuleId?: string | null; reasonTags?: LlmReasonTag[] }
): Promise<{ rule: CoachingRuleRow | null; ruleError: string | null }> {
  if (opts.violatedRuleId) await bumpViolated(opts.violatedRuleId);
  const scope: NoteScope = row.scope ?? "once";
  if (scope === "once" || (!row.comment && !row.correction)) return { rule: null, ruleError: null };
  const provider = await providerOfCall(row.callId);
  const res = await extractRule({
    trainerId: opts.trainerId,
    clientId: row.clientId,
    scope,
    source: "note",
    anchor: row.anchor ?? null,
    comment: row.comment,
    correction: row.correction,
    reasonTags: opts.reasonTags ?? row.reasonTags,
    subjectText: await subjectTextAt(row.subjectKind, row.subjectId, row.anchor ?? null),
    feedbackIds: [row.id],
    providerId: provider?.providerId,
    model: provider?.model,
  });
  return res.ok ? { rule: res.rule, ruleError: null } : { rule: null, ruleError: res.error };
}
