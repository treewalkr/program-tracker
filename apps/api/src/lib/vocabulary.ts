import { asc, eq, isNull, or } from "drizzle-orm";
import { db, exerciseAliases, exercises, glossaryTerms } from "@pt/db";
import { mergeGlossary, type GlossaryTerm, type VocabularyAlias } from "@pt/shared";

/** Global rows, plus the trainer's own when there is a trainer (the eval runs without one). */
const visibleTo = <C extends typeof glossaryTerms.trainerId | typeof exerciseAliases.trainerId>(col: C, trainerId: string | null) =>
  trainerId ? or(isNull(col), eq(col, trainerId)) : isNull(col);

/** The effective glossary: personal terms first, then the global ones not overridden. */
export async function loadGlossary(trainerId: string | null): Promise<GlossaryTerm[]> {
  const rows = await db.select().from(glossaryTerms).where(visibleTo(glossaryTerms.trainerId, trainerId));
  return mergeGlossary(rows);
}

/** Personal and global aliases with their exercise's name; personal first, then by alias. */
export async function loadAliases(trainerId: string): Promise<VocabularyAlias[]> {
  const rows = await db
    .select({
      id: exerciseAliases.id,
      alias: exerciseAliases.alias,
      exerciseId: exerciseAliases.exerciseId,
      exerciseName: exercises.name,
      source: exerciseAliases.source,
      trainerId: exerciseAliases.trainerId,
    })
    .from(exerciseAliases)
    .innerJoin(exercises, eq(exercises.id, exerciseAliases.exerciseId))
    .where(visibleTo(exerciseAliases.trainerId, trainerId))
    .orderBy(asc(exerciseAliases.alias));
  return rows
    .map(({ trainerId: owner, ...r }) => ({ ...r, scope: owner === null ? ("global" as const) : ("personal" as const) }))
    .sort((a, b) => Number(a.scope === "global") - Number(b.scope === "global"));
}
