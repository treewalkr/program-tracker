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
  /** The client's experience — same three values as an example's level. */
  level?: ExampleLevel | null;
}

/** Filler words that say nothing about what a program is for. Two goals
 *  sharing only these ("strength and power" / "mobility and balance") are
 *  not a match. */
export const GOAL_STOPWORDS: ReadonlySet<string> = new Set([
  "and", "the", "for", "with", "from", "into", "onto", "over", "per", "via",
  "your", "our", "their",
  "this", "that", "these", "those", "some", "more", "less", "all", "any",
  "get", "getting", "build", "building", "improve", "improving", "increase",
  "maintain", "general", "overall", "basic", "new", "better", "focus", "focused",
  "program", "programs", "programme", "training", "train", "plan", "block",
  "phase", "routine", "workout", "workouts", "goal", "goals", "week", "weeks",
  "day", "days", "session", "sessions",
]);

const LEVEL_RANK: Record<ExampleLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

function words(s: string): Set<string> {
  const matches = s.toLowerCase().match(/[a-z0-9]+/g);
  if (!matches) return new Set();
  const set = new Set<string>();
  for (const m of matches) {
    if (m.length >= 3 && !GOAL_STOPWORDS.has(m)) {
      set.add(m);
    }
  }
  return set;
}

/**
 * Deterministic few-shot retrieval.
 *
 * Eligibility (all must hold):
 * - the goals share at least one word — lowercase [a-z0-9]+ runs ≥ 3 chars,
 *   minus GOAL_STOPWORDS. No target goals → nothing matches;
 * - levels are not two steps apart (beginner ↔ advanced is excluded);
 * - `programId !== opts.excludeProgramId`.
 *
 * Score = 2 × distinct shared goal words
 *       + level: same +2, adjacent 0 (null on either side → 0)
 *       + days/week: exact +2, ±1 +1, else 0 (null on either side → 0).
 * Days and level only rank eligible examples; they never qualify one alone.
 * Sorts score desc then stable (caller passes newest-first), caps at
 * `opts.limit` (default 2).
 */
export function selectExamples<T extends ExampleRetrievalTags & { programId?: string | null }>(
  examples: readonly T[],
  target: ExampleTarget,
  opts?: { excludeProgramId?: string | null; limit?: number }
): T[] {
  const limit = opts?.limit ?? 2;
  if (limit <= 0) return [];

  const targetWords = target.goals ? words(target.goals) : new Set<string>();
  if (targetWords.size === 0) return [];

  const scored: { item: T; score: number; index: number }[] = [];

  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i]!;
    if (opts?.excludeProgramId && ex.programId === opts.excludeProgramId) {
      continue;
    }

    let sharedCount = 0;
    if (ex.goal) {
      const exWords = words(ex.goal);
      for (const w of targetWords) {
        if (exWords.has(w)) {
          sharedCount++;
        }
      }
    }
    if (sharedCount === 0) continue;

    let levelScore = 0;
    if (target.level != null && ex.level != null) {
      const gap = Math.abs(LEVEL_RANK[target.level] - LEVEL_RANK[ex.level]);
      if (gap >= 2) continue;
      if (gap === 0) levelScore = 2;
    }

    let daysScore = 0;
    if (target.daysPerWeek != null && ex.daysPerWeek != null) {
      const diff = Math.abs(target.daysPerWeek - ex.daysPerWeek);
      if (diff === 0) {
        daysScore = 2;
      } else if (diff === 1) {
        daysScore = 1;
      }
    }

    scored.push({ item: ex, score: 2 * sharedCount + levelScore + daysScore, index: i });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.index - b.index;
  });

  return scored.slice(0, limit).map((s) => s.item);
}
