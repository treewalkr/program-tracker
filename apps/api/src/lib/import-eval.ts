import type { ImportChunk, ImportPrescription, ImportResult, ImportSession } from "@pt/shared";

/**
 * Scoring for `bun run eval:import` (docs/paste-import-plan.md §6): how a
 * provider's read of a fixture compares with the hand-written expectation.
 */

/**
 * One expected exercise: its line, the prescription fields to compare (null =
 * must be absent) and, optionally, how many logged sets (actuals) it has and
 * text its note must keep (case-insensitive).
 */
export type ExpectedItem = { line: number; actuals?: number; noteHas?: string[] } & {
  [K in (typeof FIELDS)[number]]?: ImportPrescription[K] | null;
};

/** One expected session: the line it starts on and its kind. */
export interface ExpectedSession {
  line: number;
  kind: ImportSession["kind"];
}

/** A fixture's `<name>.expected.json`. `skipped`: lines that are not training and must be skipped. */
export interface Expected {
  items: ExpectedItem[];
  sessions?: ExpectedSession[];
  skipped?: number[];
}

const FIELDS = ["sets", "reps", "repsLow", "seconds", "failure", "repsList"] as const;

/** The expectation a hand-written extraction implies (the Week 11–12 fixture). */
export function expectedFromExtraction(chunk: ImportChunk): Expected {
  const sessions = chunk.weeks.flatMap((w) => w.days.flatMap((d) => d.sessions));
  return {
    items: sessions.flatMap((s) =>
      s.exercises.map((e) => {
        const item: ExpectedItem = { line: e.line };
        for (const f of FIELDS) {
          const v = e.prescription?.[f];
          if (v !== undefined && v !== null) (item as Record<string, unknown>)[f] = v;
        }
        if (e.actuals?.length) item.actuals = e.actuals.length;
        return item;
      }),
    ),
    sessions: sessions.flatMap((s) => (s.line == null ? [] : [{ line: s.line, kind: s.kind }])),
  };
}

export interface EvalScore {
  /** Expected exercises read with every compared field right. */
  correct: number;
  expected: number;
  /** Expected sessions found at their line with their kind. */
  sessionsCorrect: number;
  sessionsExpected: number;
  /** Sessions read in total (more than expected = split wrongly). */
  sessionsRead: number;
  /** "L12: sets 3 ≠ 4" — what went wrong, per item. */
  misses: string[];
  /** Amber number-check flags: value not in the line, number from the name, one number used twice. */
  numberFlags: number;
  implausible: number;
  unused: number;
  unreadLines: number;
}

export function scoreResult(result: ImportResult, expected: Expected): EvalScore {
  const sessions = result.weeks.flatMap((w) => w.days.flatMap((d) => d.sessions));
  const exercises = sessions.flatMap((s) => s.exercises);
  const misses: string[] = [];
  let correct = 0;
  for (const want of expected.items) {
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
    if (want.actuals !== undefined && (got.actuals?.length ?? 0) !== want.actuals)
      wrong.push(`logged sets ${got.actuals?.length ?? 0} ≠ ${want.actuals}`);
    for (const t of want.noteHas ?? []) if (!got.note.toLowerCase().includes(t.toLowerCase())) wrong.push(`note "${got.note}" lacks "${t}"`);
    if (wrong.length) misses.push(`L${want.line}: ${wrong.join(", ")}`);
    else correct++;
  }
  let sessionsCorrect = 0;
  for (const want of expected.sessions ?? []) {
    const got = sessions.find((s) => s.line === want.line);
    if (!got) misses.push(`session L${want.line}: not read`);
    else if (got.kind !== want.kind) misses.push(`session L${want.line}: ${got.kind} ≠ ${want.kind}`);
    else sessionsCorrect++;
  }
  const skipped = new Set(result.skipped.map((k) => k.line));
  for (const line of expected.skipped ?? []) if (!skipped.has(line)) misses.push(`L${line}: should be skipped`);
  if (expected.sessions && sessions.length !== expected.sessions.length)
    misses.push(`sessions: ${sessions.length} read ≠ ${expected.sessions.length}`);
  const flags = exercises.flatMap((e) => e.flags);
  return {
    correct,
    expected: expected.items.length,
    sessionsCorrect,
    sessionsExpected: expected.sessions?.length ?? 0,
    sessionsRead: sessions.length,
    misses,
    numberFlags: flags.filter((f) => f.code === "not_found" || f.code === "in_name" || f.code === "used_twice").length,
    implausible: flags.filter((f) => f.code === "implausible").length,
    unused: result.unused.length,
    unreadLines: result.unread.reduce((n, u) => n + u.to - u.from + 1, 0),
  };
}
