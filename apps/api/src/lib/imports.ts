import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { aiImports, db, exerciseAliases, exercises, type AiImportRow } from "@pt/db";
import {
  ImportChunk,
  buildImportResult,
  chunkLines,
  importLines,
  matchExercise,
  numberedLines,
  type ImportChunkOutcome,
  type ImportResult,
} from "@pt/shared";
import { callLlm, type LlmOutcome } from "../ai/llm";
import { buildImportMessages } from "../ai/prompt";
import { mockImportContent } from "../ai/mock";
import type { ProviderRuntime } from "../ai/provider";

/**
 * Paste import (docs/paste-import-plan.md §1). The paste is split into chunks
 * that are read in parallel; each finished chunk bumps chunks_done, a failed
 * chunk becomes "couldn't read" without discarding the others, and the result
 * is checked, matched and grouped in code before the row settles.
 */

const outcomeError = (out: LlmOutcome<unknown>): string =>
  out.ok ? "" : out.kind === "provider" ? out.error.message : out.kind === "validation" ? out.error : "cancelled";

/** Every chunk of the row's text through callLlm, in parallel. Null when the read was cancelled. */
export async function extractChunks(
  row: Pick<AiImportRow, "id" | "trainerId" | "clientId" | "text">,
  rt: ProviderRuntime,
  effort: string | undefined,
  signal: AbortSignal,
): Promise<ImportChunkOutcome[] | null> {
  const lines = importLines(row.text);
  const turnId = randomUUID();
  const outcomes = await Promise.all(
    chunkLines(lines).map(async (range): Promise<ImportChunkOutcome | null> => {
      const messages = buildImportMessages({ numbered: numberedLines(lines, range.from, range.to), ...range });
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

/** Chunk outcomes → the stored review result: checks, block grouping, exercise matching. */
export async function importResult(trainerId: string, text: string, outcomes: ImportChunkOutcome[]): Promise<ImportResult> {
  const result = buildImportResult(text, outcomes);
  const { catalog, aliases } = await matchContext(trainerId);
  for (const w of result.weeks)
    for (const d of w.days)
      for (const s of d.sessions) for (const e of s.exercises) e.match = matchExercise(e, catalog, aliases);
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
