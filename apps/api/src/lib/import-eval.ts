import type { ImportChunk, ImportPrescription, ImportResult } from "@pt/shared";

/**
 * Scoring for `bun run eval:import` (docs/paste-import-plan.md §6): how a
 * provider's read of a fixture compares with the hand-written expectation.
 */

/** One expected exercise: its line and the prescription fields to compare. */
export type ExpectedItem = { line: number } & Partial<
  Pick<ImportPrescription, "sets" | "reps" | "repsLow" | "seconds" | "failure" | "repsList">
>;

const FIELDS = ["sets", "reps", "repsLow", "seconds", "failure", "repsList"] as const;

/** The expectation a hand-written extraction implies (the Week 11–12 fixture). */
export function expectedFromExtraction(chunk: ImportChunk): ExpectedItem[] {
  return chunk.weeks.flatMap((w) =>
    w.days.flatMap((d) =>
      d.sessions.flatMap((s) =>
        s.exercises.map((e) => {
          const item: ExpectedItem = { line: e.line };
          for (const f of FIELDS) {
            const v = e.prescription?.[f];
            if (v !== undefined && v !== null) (item as Record<string, unknown>)[f] = v;
          }
          return item;
        }),
      ),
    ),
  );
}

export interface EvalScore {
  /** Expected exercises read with every compared field right. */
  correct: number;
  expected: number;
  /** "L12: sets 3 ≠ 4" — what went wrong, per item. */
  misses: string[];
  /** Amber number-check flags: value not in the line, number from the name, one number used twice. */
  numberFlags: number;
  implausible: number;
  unused: number;
  unreadLines: number;
}

export function scoreResult(result: ImportResult, expected: ExpectedItem[]): EvalScore {
  const exercises = result.weeks.flatMap((w) => w.days.flatMap((d) => d.sessions.flatMap((s) => s.exercises)));
  const misses: string[] = [];
  let correct = 0;
  for (const want of expected) {
    const got = exercises.find((e) => e.line === want.line);
    if (!got) {
      misses.push(`L${want.line}: not read`);
      continue;
    }
    const wrong = FIELDS.flatMap((f) => {
      if (!(f in want)) return [];
      const a = JSON.stringify(got.prescription?.[f] ?? null);
      const b = JSON.stringify(want[f]);
      return a === b ? [] : [`${f} ${a} ≠ ${b}`];
    });
    if (wrong.length) misses.push(`L${want.line}: ${wrong.join(", ")}`);
    else correct++;
  }
  const flags = exercises.flatMap((e) => e.flags);
  return {
    correct,
    expected: expected.length,
    misses,
    numberFlags: flags.filter((f) => f.code === "not_found" || f.code === "in_name" || f.code === "used_twice").length,
    implausible: flags.filter((f) => f.code === "implausible").length,
    unused: result.unused.length,
    unreadLines: result.unread.reduce((n, u) => n + u.to - u.from + 1, 0),
  };
}
