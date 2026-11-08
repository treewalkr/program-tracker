/**
 * History import (paste notes v2, docs/history-import-plan.md): the logged
 * numbers of a pasted program saved as archived programs plus real logs.
 * Pure — the API builds the plan from the stored import, the web previews it.
 */

// ---------------------------------------------------------------------------
// Dates (ISO YYYY-MM-DD, calendar math in UTC so no timezone shifts a day)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (s: string): boolean => ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** ISO weekday of a date: 1 = Mon … 7 = Sun. */
export function isoWeekday(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

// ---------------------------------------------------------------------------
// Weekday names in day labels ("Mon - Upper A", "วันจันทร์")
// ---------------------------------------------------------------------------

const ENGLISH_DAYS: [RegExp, number][] = [
  [/\b(mon|monday)\b/i, 1],
  [/\b(tue|tues|tuesday)\b/i, 2],
  [/\b(wed|weds|wednesday)\b/i, 3],
  [/\b(thu|thur|thurs|thursday)\b/i, 4],
  [/\b(fri|friday)\b/i, 5],
  [/\b(sat|saturday)\b/i, 6],
  [/\b(sun|sunday)\b/i, 7],
];

/** Thai has no spaces between words — the names are distinct enough to find as is.
 *  "อาทิตย์ที่ 2" / "อาทิตย์หน้า" mean a week, not Sunday. */
const THAI_DAYS: [RegExp, number][] = [
  [/จันทร์/, 1],
  [/อังคาร/, 2],
  [/พุธ/, 3],
  [/พฤหัส(?:บดี)?/, 4],
  [/ศุกร์/, 5],
  [/เสาร์/, 6],
  [/อาทิตย์(?!\s*(?:ที่|หน้า|นี้|ก่อน))/, 7],
];

/** The weekday a day label names (1 = Mon … 7 = Sun), the first one written; null when none. */
export function weekdayFromLabel(label: string): number | null {
  let best: { at: number; day: number } | null = null;
  for (const [re, day] of [...ENGLISH_DAYS, ...THAI_DAYS]) {
    const m = re.exec(label);
    if (m && (best === null || m.index < best.at)) best = { at: m.index, day };
  }
  return best?.day ?? null;
}

// ---------------------------------------------------------------------------
// Week and day dates
// ---------------------------------------------------------------------------

/** Start dates of `weekCount` consecutive weeks ending with the one starting `latestStart`. */
export function defaultWeekStarts(weekCount: number, latestStart: string): string[] {
  return Array.from({ length: weekCount }, (_, i) => addDays(latestStart, -7 * (weekCount - 1 - i)));
}

/**
 * One date per day of a week starting `weekStart`:
 * - a weekday in the label wins — the first such date on or after the start;
 * - else the Nth unlabeled day goes on the client's Nth training day, counted
 *   from the start's weekday;
 * - with more unlabeled days than training days, or none set: start + index.
 * Never past start + 6.
 */
export function dayDates(
  weekStart: string,
  days: readonly { label: string }[],
  trainingDays: readonly number[] | null | undefined,
): string[] {
  const startDay = isoWeekday(weekStart);
  const offsetOf = (weekday: number) => (weekday - startDay + 7) % 7;
  const named = days.map((d) => weekdayFromLabel(d.label));
  const unlabeled = named.filter((w) => w === null).length;
  const slots = [...new Set(trainingDays ?? [])].map(offsetOf).sort((a, b) => a - b);
  const useSlots = slots.length > 0 && unlabeled <= slots.length;
  let n = 0;
  return days.map((_, i) => {
    const wd = named[i];
    const offset = wd !== null ? offsetOf(wd) : useSlots ? slots[n++] : i;
    return addDays(weekStart, Math.min(6, offset));
  });
}
