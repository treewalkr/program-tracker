import { addDays, isoWeekday, sessionsByWeekday, type PortalSession, type PortalWeek } from "@pt/shared";

/** A day of the portal week, in calendar order from the block week's first day, then "any day" (weekday 0, no date). */
export interface DayGroup {
  weekday: number;
  /** The calendar day this weekday falls on inside the block week; null for "any day". */
  date: string | null;
  isToday: boolean;
  sessions: PortalSession[];
}

/** The calendar day of an ISO weekday inside a 7-day block week (which may start on any weekday). */
export function dateOfWeekday(startDate: string, weekday: number): string {
  const offset = (weekday - isoWeekday(startDate) + 7) % 7;
  return addDays(startDate, offset);
}

/**
 * The week's sessions by day in calendar order — a block week can start on any
 * weekday (it follows activation), so a Tue → Mon week lists Tue first — then
 * any day. Days with nothing planned are left out.
 */
export function dayGroups(week: PortalWeek, today: string): DayGroup[] {
  const byDay = sessionsByWeekday(week.sessions);
  const first = isoWeekday(week.startDate);
  const order = [...Array.from({ length: 7 }, (_, i) => ((first - 1 + i) % 7) + 1), 0];
  const out: DayGroup[] = [];
  for (const d of order) {
    const sessions = byDay.get(d) ?? [];
    if (sessions.length === 0) continue;
    const date = d === 0 ? null : dateOfWeekday(week.startDate, d);
    out.push({ weekday: d, date, isToday: date === today, sessions });
  }
  return out;
}

/**
 * The one session the page leads with (the green action): today's first open
 * session, else the next open one on a later day, else an open "any day"
 * session, else any open session. Null when everything is logged.
 */
export function focusSessionId(week: PortalWeek, today: string): string | null {
  if (!week.loggable) return null;
  const groups = dayGroups(week, today);
  const open = (g: DayGroup) => g.sessions.find((s) => !s.log);
  const pick =
    groups.filter((g) => g.date === today).map(open).find(Boolean) ??
    groups.filter((g) => g.date != null && g.date > today).map(open).find(Boolean) ??
    groups.filter((g) => g.date == null).map(open).find(Boolean) ??
    groups.map(open).find(Boolean);
  return pick?.id ?? null;
}

export const doneCount = (week: PortalWeek) => week.sessions.filter((s) => s.log).length;

/** The focus session itself, or null when everything is logged. */
export function focusSession(week: PortalWeek, today: string): PortalSession | null {
  const id = focusSessionId(week, today);
  return id ? (week.sessions.find((s) => s.id === id) ?? null) : null;
}

/**
 * Earlier days of this week that still have unlogged sessions — the quiet
 * "Earlier this week" list under "Next up". The focus session is left out
 * (it already leads the page), and so are days with nothing left open.
 */
export function earlierOpen(week: PortalWeek, today: string, exclude: string | null = null): DayGroup[] {
  if (!week.loggable) return [];
  return dayGroups(week, today)
    .filter((g) => g.date != null && g.date < today)
    .map((g) => ({ ...g, sessions: g.sessions.filter((s) => !s.log && s.id !== exclude) }))
    .filter((g) => g.sessions.length > 0);
}
