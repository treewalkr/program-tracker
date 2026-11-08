import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { aiImports, clients, db, exerciseAliases, exercises, programs, sessionLogs, setLogs, type AiImportRow } from "@pt/db";
import {
  ImportChunk,
  addDays,
  buildHistory as buildImportHistory,
  buildImportResult,
  isIsoDate,
  type HistorySkip,
  chunkLines,
  glossaryAbbreviations,
  importLines,
  matchExercise,
  numberedLines,
  type GlossaryTerm,
  type ImportChunkOutcome,
  type ImportResult,
} from "@pt/shared";
import { callLlm, type LlmOutcome } from "../ai/llm";
import { buildImportMessages } from "../ai/prompt";
import { mockImportContent } from "../ai/mock";
import type { ProviderRuntime } from "../ai/provider";
import { loadGlossary } from "./vocabulary";

/**
 * Paste import (docs/paste-import-plan.md §1). The paste is split into chunks
 * that are read in parallel; each finished chunk bumps chunks_done, a failed
 * chunk becomes "couldn't read" without discarding the others, and the result
 * is checked, matched and grouped in code before the row settles.
 */

const outcomeError = (out: LlmOutcome<unknown>): string =>
  out.ok ? "" : out.kind === "provider" ? out.error.message : out.kind === "validation" ? out.error : "cancelled";

/**
 * Every chunk of the row's text through callLlm, in parallel, with the
 * trainer's effective glossary in the prompt (global only when there is no
 * trainer — the eval). Null when the read was cancelled.
 */
export async function extractChunks(
  row: { id: string; trainerId: string | null; clientId: string | null; text: string },
  rt: ProviderRuntime,
  effort: string | undefined,
  signal: AbortSignal,
  glossary?: GlossaryTerm[],
): Promise<ImportChunkOutcome[] | null> {
  const lines = importLines(row.text);
  const terms = glossary ?? (await loadGlossary(row.trainerId));
  const turnId = randomUUID();
  const outcomes = await Promise.all(
    chunkLines(lines).map(async (range): Promise<ImportChunkOutcome | null> => {
      const messages = buildImportMessages({ numbered: numberedLines(lines, range.from, range.to), ...range, glossary: terms });
      const out = await callLlm({
        purpose: "program_import",
        builder: "buildImportMessages",
        links: { trainerId: row.trainerId, clientId: row.clientId },
        context: { importId: row.id, from: range.from, to: range.to },
        messages: [
          { role: "system", content: messages.system },
          { role: "user", content: messages.user },
        ],
        rt,
        effort,
        temperature: 0,
        signal,
        mode: "json",
        schema: ImportChunk,
        mock: () => mockImportContent(lines, range.from, range.to),
        turnId,
      });
      if (!out.ok && out.kind === "aborted") return null;
      await db
        .update(aiImports)
        .set({ chunksDone: sql`${aiImports.chunksDone} + 1`, updatedAt: new Date() })
        .where(and(eq(aiImports.id, row.id), eq(aiImports.status, "pending")));
      return out.ok ? { ...range, ok: true, data: out.data } : { ...range, ok: false, error: outcomeError(out) };
    }),
  );
  return outcomes.some((o) => o === null) ? null : (outcomes as ImportChunkOutcome[]);
}

/** Catalog (global + the trainer's, not archived) and aliases (global + the trainer's) for matching. */
async function matchContext(trainerId: string) {
  const [catalog, aliases] = await Promise.all([
    db
      .select({ id: exercises.id, name: exercises.name })
      .from(exercises)
      .where(and(or(isNull(exercises.trainerId), eq(exercises.trainerId, trainerId)), isNull(exercises.archivedAt))),
    db
      .select({ alias: exerciseAliases.alias, exerciseId: exerciseAliases.exerciseId, trainerId: exerciseAliases.trainerId })
      .from(exerciseAliases)
      .where(or(isNull(exerciseAliases.trainerId), eq(exerciseAliases.trainerId, trainerId))),
  ]);
  return { catalog, aliases };
}

/**
 * Chunk outcomes → the stored review result: checks, block grouping, new
 * words, and exercise matching with the trainer's glossary shorthand.
 */
export async function importResult(
  trainerId: string,
  text: string,
  outcomes: ImportChunkOutcome[],
  glossary?: GlossaryTerm[],
): Promise<ImportResult> {
  const terms = glossary ?? (await loadGlossary(trainerId));
  const result = buildImportResult(text, outcomes, terms);
  const { catalog, aliases } = await matchContext(trainerId);
  const abbreviations = glossaryAbbreviations(terms);
  for (const w of result.weeks)
    for (const d of w.days)
      for (const s of d.sessions) for (const e of s.exercises) e.match = matchExercise(e, catalog, aliases, abbreviations);
  return result;
}

/**
 * Write the outcome onto the import. Only a pending row is touched — a cancel
 * that landed mid-read wins (same rule as settleGeneration). Every chunk
 * unread → failed; otherwise done, with the unread ones in the result.
 */
export async function settleImport(
  id: string,
  result: ImportResult,
  /** True when no chunk could be read. */
  allUnread: boolean,
): Promise<{ code: 200 | 201 | 502; row: AiImportRow }> {
  const [updated] = await db
    .update(aiImports)
    .set(
      allUnread
        ? { status: "failed", error: result.unread[0]?.error ?? "couldn't read the notes", result, updatedAt: new Date() }
        : { status: "done", error: null, result, updatedAt: new Date() },
    )
    .where(and(eq(aiImports.id, id), eq(aiImports.status, "pending")))
    .returning();
  if (!updated) {
    const [row] = await db.select().from(aiImports).where(eq(aiImports.id, id));
    return { code: 200, row };
  }
  return { code: allUnread ? 502 : 201, row: updated };
}

export const recentImports = (trainerId: string, clientId: string) =>
  db
    .select({
      id: aiImports.id,
      clientId: aiImports.clientId,
      status: aiImports.status,
      providerId: aiImports.providerId,
      model: aiImports.model,
      chunksTotal: aiImports.chunksTotal,
      chunksDone: aiImports.chunksDone,
      preview: sql<string>`left(${aiImports.text}, 120)`,
      createdAt: aiImports.createdAt,
    })
    .from(aiImports)
    .where(and(eq(aiImports.trainerId, trainerId), eq(aiImports.clientId, clientId)))
    .orderBy(desc(aiImports.createdAt))
    .limit(5);

// ---------------------------------------------------------------------------
// History import (docs/history-import-plan.md §3)
// ---------------------------------------------------------------------------

export type SaveHistoryOutcome =
  | { ok: true; programs: { id: string; name: string }[]; sessions: number; sets: number; skipped: HistorySkip[] }
  | { ok: false; status: 409 | 422; error: string; ids?: string[] };

/** Today on the server, plus a day of slack for trainers ahead of UTC. */
const latestAllowedDate = () => addDays(new Date().toISOString().slice(0, 10), 1);

/**
 * Save an import's logged numbers: one archived program per block with
 * logged sessions, plus their session and set logs, in one transaction. The
 * plan is built here from the stored result — the web only sends dates and
 * exercise picks. No signal outbox: this is past training.
 */
export async function saveImportHistory(
  trainerId: string,
  row: AiImportRow,
  input: { weekStarts: string[]; exercises: Record<string, string> },
): Promise<SaveHistoryOutcome> {
  if (row.status !== "done" || !row.result) return { ok: false, status: 422, error: `import is ${row.status}, not done` };
  if (row.historyProgramIds) return { ok: false, status: 409, error: "history already saved — undo it first" };
  const result = row.result;
  if (input.weekStarts.length !== result.weeks.length) {
    return { ok: false, status: 422, error: `expected ${result.weeks.length} week starts, got ${input.weekStarts.length}` };
  }
  const latest = latestAllowedDate();
  if (input.weekStarts.some((d) => !isIsoDate(d))) return { ok: false, status: 422, error: "week starts must be YYYY-MM-DD" };
  if (input.weekStarts.some((d) => d > latest)) return { ok: false, status: 422, error: "a week starts after today" };

  const ids = [...new Set(Object.values(input.exercises))];
  const known = ids.length
    ? await db
        .select({ id: exercises.id, name: exercises.name })
        .from(exercises)
        .where(and(inArray(exercises.id, ids), or(isNull(exercises.trainerId), eq(exercises.trainerId, trainerId))))
    : [];
  const missing = ids.filter((id) => !known.some((k) => k.id === id));
  if (missing.length) return { ok: false, status: 422, error: "unknown exercises", ids: missing };

  const [client] = await db.select({ trainingDays: clients.trainingDays }).from(clients).where(eq(clients.id, row.clientId));
  const plan = buildImportHistory(result, {
    weekStarts: input.weekStarts,
    trainingDays: client?.trainingDays ?? null,
    exerciseIds: input.exercises,
    exerciseNames: Object.fromEntries(known.map((k) => [k.id, k.name])),
    today: latest,
  });
  if (plan.programs.length === 0) return { ok: false, status: 422, error: "nothing to save — no logged numbers could be used" };

  const savedOn = new Date().toISOString().slice(0, 10);
  const saved = await db.transaction(async (tx) => {
    // lock the import: a double click can't save twice
    const [locked] = await tx
      .select({ historyProgramIds: aiImports.historyProgramIds })
      .from(aiImports)
      .where(eq(aiImports.id, row.id))
      .for("update");
    if (locked?.historyProgramIds) return null;
    const out: { id: string; name: string }[] = [];
    for (const p of plan.programs) {
      const [program] = await tx
        .insert(programs)
        .values({
          trainerId,
          clientId: row.clientId,
          name: p.name,
          description: `Imported from notes on ${savedOn}`,
          status: "archived",
          sessions: p.weeks,
          activatedAt: new Date(`${p.activatedAt}T00:00:00Z`),
        })
        .returning({ id: programs.id, name: programs.name });
      out.push(program);
      for (const l of p.logs) {
        const [log] = await tx
          .insert(sessionLogs)
          .values({
            clientId: row.clientId,
            programId: program.id,
            programSessionId: l.programSessionId,
            date: l.date,
            kind: "lifting",
            notes: l.notes,
          })
          .returning({ id: sessionLogs.id });
        await tx.insert(setLogs).values(
          l.sets.map((s) => ({
            sessionLogId: log.id,
            programExerciseId: s.programExerciseId,
            exerciseId: s.exerciseId,
            setNumber: s.setNumber,
            weightKg: s.weightKg !== undefined ? String(s.weightKg) : null,
            reps: s.reps,
          })),
        );
      }
    }
    await tx.update(aiImports).set({ historyProgramIds: out.map((p) => p.id), updatedAt: new Date() }).where(eq(aiImports.id, row.id));
    return out;
  });
  if (!saved) return { ok: false, status: 409, error: "history already saved — undo it first" };

  const logs = plan.programs.flatMap((p) => p.logs);
  return {
    ok: true,
    programs: saved,
    sessions: logs.length,
    sets: logs.reduce((n, l) => n + l.sets.length, 0),
    skipped: plan.skipped,
  };
}

/** Undo a history save: its programs go (their logs cascade) and the import can be saved again. */
export async function undoImportHistory(trainerId: string, row: AiImportRow): Promise<{ removed: number } | null> {
  const ids = row.historyProgramIds;
  if (!ids) return null;
  return db.transaction(async (tx) => {
    const removed = ids.length
      ? await tx
          .delete(programs)
          .where(and(inArray(programs.id, ids), eq(programs.trainerId, trainerId)))
          .returning({ id: programs.id })
      : [];
    await tx.update(aiImports).set({ historyProgramIds: null, updatedAt: new Date() }).where(eq(aiImports.id, row.id));
    return { removed: removed.length };
  });
}
