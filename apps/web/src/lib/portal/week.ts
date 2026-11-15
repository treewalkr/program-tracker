import { addDays, isoWeekday, sessionsByWeekday, type PortalSession, type PortalWeek } from "@pt/shared";

/** A day of the portal week: Mon → Sun, then "any day" (weekday 0, no date). */
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

/** The week's sessions by day, Mon → Sun then any day; days with nothing planned are left out. */
export function dayGroups(week: PortalWeek, today: string): DayGroup[] {
  const byDay = sessionsByWeekday(week.sessions);
  const out: DayGroup[] = [];
  for (const d of [1, 2, 3, 4, 5, 6, 7, 0]) {
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
