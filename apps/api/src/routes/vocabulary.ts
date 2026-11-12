import { Elysia, t } from "elysia";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, exerciseAliases, exercises, glossaryTerms } from "@pt/db";
import { normalizeAlias, type GlossaryTerm } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { loadAliases, loadGlossary } from "../lib/vocabulary";
import { VocabularyModel } from "../models/vocabulary";

const IdParams = t.Object({ id: t.String({ format: "uuid" }) });

const GLOBAL_READ_ONLY = { error: "global entries are read-only — override it to make your own" } as const;

/** Single spaces, trimmed. */
const clean = (s: string) => s.trim().replace(/\s+/g, " ");

/** True when the exercise is in the trainer's catalog (the library or their own). */
async function exerciseVisible(trainerId: string, exerciseId: string) {
  const [row] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), or(isNull(exercises.trainerId), eq(exercises.trainerId, trainerId))));
  return !!row;
}

/** The trainer's own term already written `term` (any case), other than `except`. */
async function personalTerm(trainerId: string, term: string, except?: string) {
  const [row] = await db
    .select({ term: glossaryTerms.term })
    .from(glossaryTerms)
    .where(
      and(
        eq(glossaryTerms.trainerId, trainerId),
        sql`lower(${glossaryTerms.term}) = ${term.toLowerCase()}`,
        ...(except ? [ne(glossaryTerms.id, except)] : []),
      ),
    );
  return row;
}

const personal = (r: typeof glossaryTerms.$inferSelect): GlossaryTerm => ({
  id: r.id,
  term: r.term,
  meaning: r.meaning,
  kind: r.kind,
  scope: "personal",
});

/**
 * The trainer's words (vocabulary, paste import v1.1): aliases (as written →
 * exercise) and the glossary the import prompt and matcher read. Global
 * (null-trainer) rows are seed-only: any write to one is 403 — override it
 * with a personal row instead. Ownership of `:id` is checked in
 * lib/ownership.ts (global rows pass through to the 403 here).
 */
export const vocabularyRoutes = new Elysia({ prefix: "/v1/vocabulary", tags: ["vocabulary"] })
  .use(trainerContext)
  /** Personal and global aliases with their exercise's name. */
  .get("/aliases", ({ trainerId }) => loadAliases(trainerId))
  /** Save personal aliases (upsert by alias) — from an import's confirmed matches, or by hand. */
  .post(
    "/aliases",
    async ({ body, status, trainerId }) => {
      const items = body.items.map((i) => ({ ...i, alias: normalizeAlias(i.alias) }));
      if (items.some((i) => i.alias === "")) return status(422, { error: "alias is empty" });

      // a personal alias may only point into the trainer's catalog (library or their own)
      const ids = [...new Set(items.map((i) => i.exerciseId))];
      const visible = await db
        .select({ id: exercises.id })
        .from(exercises)
        .where(and(inArray(exercises.id, ids), or(isNull(exercises.trainerId), eq(exercises.trainerId, trainerId))));
      if (visible.length !== ids.length) return status(404, { error: "exercise not found" });

      // last one wins when the same alias appears twice in one request
      const byAlias = new Map(items.map((i) => [i.alias, i]));
      const now = new Date();
      const rows = await db
        .insert(exerciseAliases)
        .values([...byAlias.values()].map((i) => ({ trainerId, alias: i.alias, exerciseId: i.exerciseId, source: i.source })))
        .onConflictDoUpdate({
          target: [exerciseAliases.trainerId, exerciseAliases.alias],
          set: { exerciseId: sql`excluded.exercise_id`, source: sql`excluded.source`, updatedAt: now },
        })
        .returning();
      return status(201, { aliases: rows });
    },
    {
      body: VocabularyModel.saveAliases,
    }
  )
  /** Point a personal alias at another exercise. */
  .patch(
    "/aliases/:id",
    async ({ params, body, status, trainerId }) => {
      const [row] = await db.select().from(exerciseAliases).where(eq(exerciseAliases.id, params.id));
      if (!row) return status(404, { error: "alias not found" });
      if (row.trainerId === null) return status(403, GLOBAL_READ_ONLY);
      if (!(await exerciseVisible(trainerId, body.exerciseId))) return status(404, { error: "exercise not found" });
      await db
        .update(exerciseAliases)
        .set({ exerciseId: body.exerciseId, source: "manual", updatedAt: new Date() })
        .where(and(eq(exerciseAliases.id, params.id), eq(exerciseAliases.trainerId, trainerId)));
      return (await loadAliases(trainerId)).find((a) => a.id === params.id)!;
    },
    { params: IdParams, body: VocabularyModel.moveAlias }
  )
  .delete(
    "/aliases/:id",
    async ({ params, status, trainerId }) => {
      const [row] = await db.select().from(exerciseAliases).where(eq(exerciseAliases.id, params.id));
      if (!row) return status(404, { error: "alias not found" });
      if (row.trainerId === null) return status(403, GLOBAL_READ_ONLY);
      await db.delete(exerciseAliases).where(and(eq(exerciseAliases.id, params.id), eq(exerciseAliases.trainerId, trainerId)));
      return { id: params.id };
    },
    { params: IdParams }
  )
  /** The effective glossary: personal terms, then global ones not overridden by a personal term of the same word. */
  .get("/glossary", ({ trainerId }) => loadGlossary(trainerId))
  .post(
    "/glossary",
    async ({ body, status, trainerId }) => {
      const term = clean(body.term);
      const meaning = clean(body.meaning);
      if (!term) return status(422, { error: "term is required" });
      if (!meaning) return status(422, { error: "say what it means" });
      const clash = await personalTerm(trainerId, term);
      if (clash) return status(409, { error: `"${clash.term}" is already in your glossary` });
      const [row] = await db.insert(glossaryTerms).values({ trainerId, term, meaning, kind: body.kind }).returning();
      return status(201, personal(row));
    },
    { body: VocabularyModel.createTerm }
  )
  .patch(
    "/glossary/:id",
    async ({ params, body, status, trainerId }) => {
      const [row] = await db.select().from(glossaryTerms).where(eq(glossaryTerms.id, params.id));
      if (!row) return status(404, { error: "term not found" });
      if (row.trainerId === null) return status(403, GLOBAL_READ_ONLY);
      const set: Partial<typeof glossaryTerms.$inferInsert> = { updatedAt: new Date() };
      if (body.term !== undefined) {
        const term = clean(body.term);
        if (!term) return status(422, { error: "term is required" });
        const clash = await personalTerm(trainerId, term, params.id);
        if (clash) return status(409, { error: `"${clash.term}" is already in your glossary` });
        set.term = term;
      }
      if (body.meaning !== undefined) {
        const meaning = clean(body.meaning);
        if (!meaning) return status(422, { error: "say what it means" });
        set.meaning = meaning;
      }
      if (body.kind !== undefined) set.kind = body.kind;
      const [updated] = await db
        .update(glossaryTerms)
        .set(set)
        .where(and(eq(glossaryTerms.id, params.id), eq(glossaryTerms.trainerId, trainerId)))
        .returning();
      return personal(updated);
    },
    { params: IdParams, body: VocabularyModel.updateTerm }
  )
  .delete(
    "/glossary/:id",
    async ({ params, status, trainerId }) => {
      const [row] = await db.select().from(glossaryTerms).where(eq(glossaryTerms.id, params.id));
      if (!row) return status(404, { error: "term not found" });
      if (row.trainerId === null) return status(403, GLOBAL_READ_ONLY);
      await db.delete(glossaryTerms).where(and(eq(glossaryTerms.id, params.id), eq(glossaryTerms.trainerId, trainerId)));
      return { id: params.id };
    },
    { params: IdParams }
  );
