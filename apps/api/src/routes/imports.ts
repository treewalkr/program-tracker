import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { aiImports, db } from "@pt/db";
import { DEFAULT_PROVIDER_ID, chunkLines, importLines } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { ContextError, providerRuntime, resolveEffort } from "../ai/runtime";
import { abortGeneration, deregisterGeneration, registerGeneration } from "../ai/cancellation";
import { extractChunks, importResult, recentImports, saveImportHistory, settleImport, undoImportHistory } from "../lib/imports";
import { loadGlossary } from "../lib/vocabulary";
import { ImportModel } from "../models/imports";

/** Paste notes → a stored, resumable, cancellable import (docs/paste-import-plan.md §1). */
export const importRoutes = new Elysia({ prefix: "/v1/ai/imports", tags: ["ai"] })
  .use(trainerContext)
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      try {
        const providerId = body.providerId ?? DEFAULT_PROVIDER_ID;
        const rt = providerRuntime(providerId, body.model);
        const effort = resolveEffort(rt, body.effort);
        const text = importLines(body.text).join("\n");
        const chunks = chunkLines(importLines(text));
        if (chunks.length === 0) return status(422, { error: "nothing to read — paste some notes" });

        const [row] = await db
          .insert(aiImports)
          .values({
            trainerId,
            clientId: body.clientId,
            text,
            providerId,
            model: rt.model,
            effort: effort ?? rt.defaultEffort ?? null,
            status: "pending",
            chunksTotal: chunks.length,
          })
          .returning();

        const ac = registerGeneration(row.id);
        try {
          // one glossary for the prompt and the result: a term saved mid-read applies from the next read
          const glossary = await loadGlossary(trainerId);
          const outcomes = await extractChunks(row, rt, effort, ac.signal, glossary);
          if (outcomes === null) {
            const [current] = await db.select().from(aiImports).where(eq(aiImports.id, row.id));
            return status(200, current);
          }
          const result = await importResult(trainerId, text, outcomes, glossary);
          const { code, row: settled } = await settleImport(row.id, result, outcomes.every((o) => !o.ok));
          return status(code, settled);
        } finally {
          deregisterGeneration(row.id);
        }
      } catch (err) {
        if (err instanceof ContextError) return status(err.status, { error: err.message });
        throw err;
      }
    },
    {
      body: ImportModel.create,
    }
  )
  /** The client's 5 most recent imports, newest first (no result — open one to get it). */
  .get("/", ({ query, trainerId }) => recentImports(trainerId, query.clientId), {
    query: t.Object({ clientId: t.String() }),
  })
  /** The row with chunksDone / chunksTotal — polled while pending. */
  .get(
    "/:id",
    async ({ params, status }) => {
      const [row] = await db.select().from(aiImports).where(eq(aiImports.id, params.id));
      if (!row) return status(404, { error: "import not found" });
      return row;
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/:id/cancel",
    async ({ params, status }) => {
      const [cancelled] = await db
        .update(aiImports)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(aiImports.id, params.id), eq(aiImports.status, "pending")))
        .returning();
      if (!cancelled) {
        const [row] = await db.select().from(aiImports).where(eq(aiImports.id, params.id));
        if (!row) return status(404, { error: "import not found" });
        return status(409, { error: `import is ${row.status}, not pending` });
      }
      abortGeneration(params.id);
      return cancelled;
    },
    { params: t.Object({ id: t.String() }) }
  )
  /**
   * Save the import's logged numbers as archived programs + logs (history
   * import, docs/history-import-plan.md §3). The plan is rebuilt here from the
   * stored result; the body only carries dates and exercise picks.
   */
  .post(
    "/:id/history",
    async ({ params, body, status, trainerId }) => {
      const [row] = await db.select().from(aiImports).where(eq(aiImports.id, params.id));
      if (!row) return status(404, { error: "import not found" });
      const out = await saveImportHistory(trainerId, row, body);
      if (!out.ok) return status(out.status, { error: out.error, ...(out.ids ? { ids: out.ids } : {}) });
      const { ok: _, ...saved } = out;
      return status(201, saved);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        /** One start date (YYYY-MM-DD) per week of the result. */
        weekStarts: t.Array(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), { maxItems: 60 }),
        /** historyExerciseKey(sourceName) → catalog exercise id. */
        exercises: t.Record(t.String({ maxLength: 200 }), t.String({ format: "uuid" })),
      }),
    }
  )
  /** Undo a history save: deletes its programs (logs cascade); the import can be saved again. */
  .delete(
    "/:id/history",
    async ({ params, status, trainerId }) => {
      const [row] = await db.select().from(aiImports).where(eq(aiImports.id, params.id));
      if (!row) return status(404, { error: "import not found" });
      const undone = await undoImportHistory(trainerId, row);
      if (!undone) return status(409, { error: "no saved history to undo" });
      return undone;
    },
    { params: t.Object({ id: t.String() }) }
  );
