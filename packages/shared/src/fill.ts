import { ROTATIONS, isAlternating, type ProgramWeek } from "./domain";
import { blockWeekOfDate, type SignalProgram } from "./metrics";

// ---------------------------------------------------------------------------
// Fill with AI (FB-013): the trainer wrote the first week(s), the AI writes the rest
// ---------------------------------------------------------------------------

/** A log as the fill rule reads it: its program, session (null = freestyle) and day. */
export interface FillLog {
  programId: string;
  programSessionId?: string | null;
  date: string;
}

/**
 * Weeks of `program` that have a log: the week holding the logged session,
 * or, for a freestyle log, the block week of its date. Sorted, unique.
 */
export function loggedWeeks(program: SignalProgram, logs: readonly FillLog[]): number[] {
  const mine = logs.filter((l) => l.programId === program.id);
  const weekOfSession = new Map(program.weeks.flatMap((w) => w.sessions.map((s) => [s.id, w.week] as const)));
  const anchor = mine.map((l) => ({ programId: l.programId, date: l.date, sets: [] }));
  const out = new Set<number>();
  for (const l of mine) {
    const w = l.programSessionId ? weekOfSession.get(l.programSessionId) : undefined;
    out.add(w ?? Math.min(blockWeekOfDate(program, anchor, l.date), program.weeks.length));
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Weeks a fill keeps as they are: every week up to the last logged week, and
 * at least the first week of each letter (W1, or W1 + W2 in an A/B block) so
 * the AI has the trainer's routine to build on. The rest is rewritten.
 */
export function fillLockedWeeks(weeks: readonly Pick<ProgramWeek, "week" | "rotation">[], logged: readonly number[]): number[] {
  const firsts = isAlternating(weeks)
    ? ROTATIONS.flatMap((r) => weeks.find((w) => w.rotation === r)?.week ?? [])
    : weeks.slice(0, 1).map((w) => w.week);
  const cutoff = Math.max(0, ...logged, ...firsts);
  return weeks.filter((w) => w.week <= cutoff).map((w) => w.week);
}

/** "W3–W8", "W4", "W2, W5" — compact week lists for buttons and notes. */
export function weekRangeLabel(weeks: readonly number[]): string {
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const contiguous = sorted.every((w, i) => i === 0 || w === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 2) return `W${sorted[0]}–W${sorted.at(-1)}`;
  return sorted.map((w) => `W${w}`).join(", ");
}
