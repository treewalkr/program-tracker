import { z } from "zod";

export const EXAMPLE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const ExampleLevel = z.enum(EXAMPLE_LEVELS);
export type ExampleLevel = z.infer<typeof ExampleLevel>;

/** Create-input for marking a program as an example. */
export const ProgramExampleInput = z.object({
  programId: z.string().uuid(),
  goal: z.string().min(1).max(120),
  level: ExampleLevel,
  daysPerWeek: z.number().int().min(1).max(7).optional(),
  note: z.string().max(500).optional(),
});
export type ProgramExampleInput = z.infer<typeof ProgramExampleInput>;

/** Partial tag edit — explicit object, NOT derived from the input schema:
 *  note must accept null (clears); absent leaves it untouched. */
export const ProgramExamplePatch = z.object({
  goal: z.string().min(1).max(120).optional(),
  level: ExampleLevel.optional(),
  daysPerWeek: z.number().int().min(1).max(7).optional(),
  /** null clears the note; absent leaves it untouched. */
  note: z.string().max(500).nullable().optional(),
});
export type ProgramExamplePatch = z.infer<typeof ProgramExamplePatch>;

export interface ExampleRetrievalTags {
  goal: string | null;
  level: ExampleLevel | null;
  daysPerWeek: number | null;
  createdAt: string | Date;
}
export interface ExampleTarget {
  goals?: string | null;
  daysPerWeek?: number | null;
}

function words(s: string): Set<string> {
  const matches = s.toLowerCase().match(/[a-z0-9]+/g);
  if (!matches) return new Set();
  const set = new Set<string>();
  for (const m of matches) {
    if (m.length >= 3) {
      set.add(m);
    }
  }
  return set;
}

/**
 * Deterministic few-shot retrieval. Score: goalScore + daysScore where
 * goalScore = 2 × distinct shared words (lowercase [a-z0-9]+ runs ≥ 3 chars,
 * deduped per side) and daysScore = exact days/week +2 / ±1 +1 / else 0
 * (null on either side → 0). level never scores (the client has no level —
 * it reaches the model via the prompt header line). Keeps score > 0 only,
 * sorts score desc then stable (caller passes newest-first), excludes
 * `opts.excludeProgramId`, caps at `opts.limit` (default 2).
 */
export function selectExamples<T extends ExampleRetrievalTags & { programId?: string | null }>(
  examples: readonly T[],
  target: ExampleTarget,
  opts?: { excludeProgramId?: string | null; limit?: number }
): T[] {
  const limit = opts?.limit ?? 2;
  if (limit <= 0) return [];

  const targetWords = target.goals ? words(target.goals) : new Set<string>();

  const scored: { item: T; score: number; index: number }[] = [];

  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i]!;
    if (opts?.excludeProgramId && ex.programId === opts.excludeProgramId) {
      continue;
    }

    let sharedCount = 0;
    if (targetWords.size > 0 && ex.goal) {
      const exWords = words(ex.goal);
      for (const w of targetWords) {
        if (exWords.has(w)) {
          sharedCount++;
        }
      }
    }
    const goalScore = 2 * sharedCount;

    let daysScore = 0;
    if (target.daysPerWeek != null && ex.daysPerWeek != null) {
      const diff = Math.abs(target.daysPerWeek - ex.daysPerWeek);
      if (diff === 0) {
        daysScore = 2;
      } else if (diff === 1) {
        daysScore = 1;
      }
    }

    const score = goalScore + daysScore;
    if (score > 0) {
      scored.push({ item: ex, score, index: i });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.index - b.index;
  });

  return scored.slice(0, limit).map((s) => s.item);
}
