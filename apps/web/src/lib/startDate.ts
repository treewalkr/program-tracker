import { blockWeekOfDate, startsOnIssue, type SignalProgram } from "@pt/shared";
import { weekdayDayMonth, weekRangeLabel } from "./programEdit";

/** "Week 1 starts on" dialog: shortcuts, the live line, and which logs move. Pure. */

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS;
const isoOfDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => isoOfDay(dayNumber(iso) + n);

/** The Monday after `today` (a week on when today is a Monday). */
export function nextMonday(today: string): string {
  const weekday = ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = Mon
  return addDays(today, 8 - weekday);
}

/**
 * What the chosen date means today: "Today is W3 · 17–23 Nov", "Starts in 4
 * days · Mon 23 Nov", "Starts tomorrow · Fri 20 Nov", or "Ended …" when the
 * block would already be over.
 */
export function startLine(date: string, today: string, weeks: number): string {
  const diff = dayNumber(date) - dayNumber(today);
  if (diff > 0) return `${diff === 1 ? "Starts tomorrow" : `Starts in ${diff} days`} · ${weekdayDayMonth(date)}`;
  const week = Math.floor(-diff / 7) + 1;
  const start = addDays(date, (week - 1) * 7);
  if (week > weeks) return `The block would have ended ${weekdayDayMonth(addDays(date, weeks * 7 - 1))}`;
  return `Today is W${week} · ${weekRangeLabel(start, addDays(start, 6))}`;
}

/** The dialog's error line for a date, in the trainer's words; null when it's fine. */
export function startIssue(date: string, today: string, weeks: number): string | null {
  if (!date) return "Pick a date.";
  const issue = startsOnIssue(date, weeks, today);
  if (!issue) return null;
  if (issue.includes("no earlier")) return `Too early: a ${weeks}-week block starting then would already be over.`;
  if (issue.includes("ahead")) return "Pick a date at most 8 weeks ahead.";
  return "Pick a valid date.";
}

export interface MovedLog {
  date: string;
  from: number;
  to: number;
}

type AnchorLog = { programId: string; date: string };

/** Logs whose block week changes when Week 1 moves to `startsOn`, oldest first. */
export function movedLogs(program: SignalProgram, logs: readonly AnchorLog[], startsOn: string): MovedLog[] {
  const signal = logs.filter((l) => l.programId === program.id).map((l) => ({ programId: l.programId, date: l.date, sets: [] }));
  const moved = { ...program, startsOn };
  return signal
    .map((l) => ({ date: l.date.slice(0, 10), from: blockWeekOfDate(program, signal, l.date), to: blockWeekOfDate(moved, signal, l.date) }))
    .filter((m) => m.from !== m.to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** "5 logged sessions move to another week" / "No logged session changes week". */
export function movedSummary(moved: readonly MovedLog[]): string {
  if (moved.length === 0) return "No logged session changes week.";
  return `${moved.length} logged ${moved.length === 1 ? "session moves" : "sessions move"} to another week.`;
}
