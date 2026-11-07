import { and, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import {
  db,
  aiGenerations,
  chatMessages,
  clientMessages,
  exercises,
  llmCalls,
  llmFeedback,
  type AiGenerationRow,
  type LlmFeedbackRow,
  type ProgramRow,
} from "@pt/db";
import {
  LLM_SIGNAL_SCORE,
  PROGRAM_EDIT_FEEDBACK_DAYS,
  aiDraftToDiffSource,
  diffSources,
  setsOf,
  type AiProgramDraft,
  type DiffRow,
  type DiffSource,
  type LlmPurpose,
  type LlmSignal,
  type LlmSubjectKind,
  type ProgramWeek,
} from "@pt/shared";

/**
 * Verdicts on LLM outputs (llm_feedback, insert-only). Implicit signals are
 * recorded as a side effect of trainer actions — approve, reject, revise,
 * build — and must never break that action, so recordFeedback swallows its
 * own failures and returns null.
 */

export interface FeedbackInput {
  trainerId: string | null;
  clientId?: string | null;
  subjectKind: LlmSubjectKind;
  subjectId: string;
  signal: LlmSignal;
  /** Defaults to the call that produced the subject (see resolveCallId). */
  callId?: string | null;
  /** Defaults to LLM_SIGNAL_SCORE[signal]. */
  score?: -1 | 0 | 1 | null;
  reasonTags?: string[];
  comment?: string | null;
  payload?: Record<string, unknown> | null;
}

export async function recordFeedback(input: FeedbackInput): Promise<LlmFeedbackRow | null> {
  try {
    const callId = input.callId !== undefined ? input.callId : await resolveCallId(input.subjectKind, input.subjectId);
    const [row] = await db
      .insert(llmFeedback)
      .values({
        trainerId: input.trainerId,
        clientId: input.clientId ?? null,
        callId,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        signal: input.signal,
        score: input.score !== undefined ? input.score : LLM_SIGNAL_SCORE[input.signal],
        reasonTags: input.reasonTags ?? [],
        comment: input.comment?.trim() || null,
        payload: input.payload ?? null,
      })
      .returning();
    return row;
  } catch (err) {
    console.error("[llm-log] failed to record feedback:", err);
    return null;
  }
}

const DRAFT_PURPOSES: LlmPurpose[] = ["block_generate", "week_generate", "revision", "week_revision"];

/** The last successful call that produced the subject, or null. */
export async function resolveCallId(kind: LlmSubjectKind, id: string): Promise<string | null> {
  if (kind === "call") return id;
  const ok = eq(llmCalls.status, "ok");
  let where: SQL | undefined;
  if (kind === "chat_message") where = and(eq(llmCalls.chatMessageId, id), ok);
  else if (kind === "client_message") where = and(eq(llmCalls.clientMessageId, id), ok);
  else {
    // Hand edits (block plan) make a version with no call — judge the AI version under it.
    const genId = await nearestAiGeneration(id);
    if (!genId) return null;
    where = and(eq(llmCalls.generationId, genId), ok, inArray(llmCalls.purpose, DRAFT_PURPOSES));
  }
  const [row] = await db.select({ id: llmCalls.id }).from(llmCalls).where(where).orderBy(desc(llmCalls.createdAt)).limit(1);
  return row?.id ?? null;
}

async function nearestAiGeneration(id: string): Promise<string | null> {
  let current: string | null = id;
  for (let hops = 0; current && hops < 50; hops++) {
    const [gen]: AiGenerationRow[] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, current));
    if (!gen) return null;
    if (!gen.manualEdit) return gen.id;
    current = gen.parentGenerationId;
  }
  return null;
}

/** True when this subject already carries one of these signals (implicit signals fire once). */
export async function hasFeedback(kind: LlmSubjectKind, id: string, signals: LlmSignal[]): Promise<boolean> {
  const rows = await db
    .select({ id: llmFeedback.id })
    .from(llmFeedback)
    .where(and(eq(llmFeedback.subjectKind, kind), eq(llmFeedback.subjectId, id), inArray(llmFeedback.signal, signals)))
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Diffs
// ---------------------------------------------------------------------------

async function exerciseNames(trainerId: string): Promise<Map<string, string>> {
  const rows = await db.select({ id: exercises.id, name: exercises.name, trainerId: exercises.trainerId }).from(exercises);
  return new Map(rows.filter((r) => r.trainerId === null || r.trainerId === trainerId).map((r) => [r.id, r.name]));
}

function weekSource(week: ProgramWeek | undefined, names: Map<string, string>): DiffSource | null {
  if (!week) return null;
  return {
    sessions: week.sessions.map((s) => ({
      name: s.name,
      exercises: s.exercises.map((e) => ({
        name: names.get(e.exerciseId) ?? e.exerciseName ?? e.exerciseId,
        sets: setsOf(e.prescribedSets),
      })),
    })),
  };
}

const changed = (rows: DiffRow[]) => rows.filter((r) => r.change !== "kept");

/** AI draft vs the week the trainer approved into. */
export async function draftToWeekDiff(
  trainerId: string,
  draft: AiProgramDraft,
  week: ProgramWeek | undefined
): Promise<DiffRow[]> {
  return changed(diffSources(aiDraftToDiffSource(draft), weekSource(week, await exerciseNames(trainerId))));
}

/** Every changed week between two versions of a program. */
export async function programVersionDiff(
  trainerId: string,
  before: ProgramWeek[],
  after: ProgramWeek[]
): Promise<{ week: number; rows: DiffRow[] }[]> {
  const names = await exerciseNames(trainerId);
  const weeks = [...new Set([...before.map((w) => w.week), ...after.map((w) => w.week)])].sort((a, b) => a - b);
  return weeks
    .map((week) => ({
      week,
      rows: changed(
        diffSources(
          weekSource(before.find((w) => w.week === week), names) ?? { sessions: [] },
          weekSource(after.find((w) => w.week === week), names) ?? { sessions: [] }
        )
      ),
    }))
    .filter((w) => w.rows.length > 0);
}

// ---------------------------------------------------------------------------
// Implicit signals that need a lookup
// ---------------------------------------------------------------------------

/** A new generation while the latest draft of the same kind was never approved → weak negative on it. */
export async function recordRegenerated(
  trainerId: string,
  clientId: string,
  kind: "block" | "week",
  newGenerationId: string
): Promise<void> {
  try {
    const [previous] = await db
      .select()
      .from(aiGenerations)
      .where(
        and(
          eq(aiGenerations.clientId, clientId),
          eq(aiGenerations.kind, kind),
          eq(aiGenerations.status, "validated"),
          ne(aiGenerations.id, newGenerationId)
        )
      )
      .orderBy(desc(aiGenerations.createdAt))
      .limit(1);
    if (!previous || (await hasFeedback("generation", previous.id, ["draft_regenerated"]))) return;
    await recordFeedback({
      trainerId,
      clientId,
      subjectKind: "generation",
      subjectId: previous.id,
      signal: "draft_regenerated",
      payload: { newGenerationId },
    });
  } catch (err) {
    console.error("[llm-log] failed to record regenerate:", err);
  }
}

/** Open proposals the trainer moved past without building or adjusting → weak negative. */
export async function recordIgnoredProposals(trainerId: string, clientId: string): Promise<void> {
  try {
    const open = await db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.clientId, clientId),
          eq(chatMessages.kind, "proposal"),
          isNull(chatMessages.hiddenAt),
          sql`${chatMessages.proposal}->>'builtGenerationId' is null`
        )
      );
    for (const row of open) {
      if (await hasFeedback("chat_message", row.id, ["proposal_ignored", "proposal_adjusted", "proposal_built"])) continue;
      await recordFeedback({ trainerId, clientId, subjectKind: "chat_message", subjectId: row.id, signal: "proposal_ignored" });
    }
  } catch (err) {
    console.error("[llm-log] failed to record ignored proposals:", err);
  }
}

/** Trainer edits to a program within PROGRAM_EDIT_FEEDBACK_DAYS of approving an AI draft into it. */
export async function recordProgramEdit(trainerId: string, before: ProgramRow, after: ProgramRow): Promise<void> {
  try {
    const since = new Date(Date.now() - PROGRAM_EDIT_FEEDBACK_DAYS * 86400_000);
    const [gen] = await db
      .select()
      .from(aiGenerations)
      .where(
        and(
          eq(aiGenerations.approvedProgramId, before.id),
          eq(aiGenerations.status, "approved"),
          sql`${aiGenerations.createdAt} >= ${since.toISOString()}`
        )
      )
      .orderBy(desc(aiGenerations.createdAt))
      .limit(1);
    if (!gen) return;
    const weeks = await programVersionDiff(trainerId, before.sessions, after.sessions);
    const phasingChanged = JSON.stringify(before.phasing ?? null) !== JSON.stringify(after.phasing ?? null);
    if (weeks.length === 0 && !phasingChanged) return;
    await recordFeedback({
      trainerId,
      clientId: before.clientId,
      subjectKind: "generation",
      subjectId: gen.id,
      signal: "program_edited_after_approval",
      payload: {
        programId: before.id,
        fromVersion: before.version,
        toVersion: after.version,
        weeks,
        ...(phasingChanged ? { phasingBefore: before.phasing, phasingAfter: after.phasing } : {}),
      },
    });
  } catch (err) {
    console.error("[llm-log] failed to record program edit:", err);
  }
}

/** Who owns a feedback subject (trainer + client), or null when it does not exist. */
export async function subjectOwner(kind: LlmSubjectKind, id: string): Promise<{ trainerId: string | null; clientId: string | null } | null> {
  if (kind === "generation") {
    const [r] = await db.select({ trainerId: aiGenerations.trainerId, clientId: aiGenerations.clientId }).from(aiGenerations).where(eq(aiGenerations.id, id));
    return r ?? null;
  }
  if (kind === "chat_message") {
    const [r] = await db.select({ trainerId: chatMessages.trainerId, clientId: chatMessages.clientId }).from(chatMessages).where(eq(chatMessages.id, id));
    return r ?? null;
  }
  if (kind === "client_message") {
    const [r] = await db.select({ trainerId: clientMessages.trainerId, clientId: clientMessages.clientId }).from(clientMessages).where(eq(clientMessages.id, id));
    return r ?? null;
  }
  const [r] = await db.select({ trainerId: llmCalls.trainerId, clientId: llmCalls.clientId }).from(llmCalls).where(eq(llmCalls.id, id));
  return r ?? null;
}
