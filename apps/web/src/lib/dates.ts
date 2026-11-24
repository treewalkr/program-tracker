/** Calendar-day helpers on `YYYY-MM-DD` strings, kept apart from the sample data so the roster can use them alone. */

/** Whole calendar days from a `YYYY-MM-DD` day to `today` (`YYYY-MM-DD`). */
export function daysBetween(day: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
}

/** `12 Mar`, or `12 Mar 2025` outside the current year. */
export function shortDay(day: string, today: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/** Local `YYYY-MM-DD`. */
export function localToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
