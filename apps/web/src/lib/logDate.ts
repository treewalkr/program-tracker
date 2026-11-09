import { blockAnchorDate, sessionsByWeekday, type SessionKind } from "@pt/shared";

/**
 * The log page's date ↔ session link. Week windows are the block's 7-day
 * buckets from its anchor — the same buckets block pulse uses — so "week 3"
 * here is week 3 everywhere else.
 */

export interface DateSession {
  id: string;
  /** ISO 1=Mon…7=Sun; null/absent = "Any day". */
  weekday?: number | null;
  order: number;
  kind: SessionKind;
  seq: number;
}

export interface DateProgram {
  id: string;
  activatedAt?: string | null;
  createdAt: string;
  weeks: { week: number; sessions: DateSession[] }[];
}

export interface DateLog {
  programId: string;
  date: string;
  programSessionId?: string | null;
}

/** Why a session was picked for a date — the page turns it into the reason line. */
export type PickWhy =
  /** Placed on the date's weekday, not logged yet. */
  | "scheduled"
  /** Nothing open that day: the first open session placed earlier in the week. */
  | "earlier"
  /** Nothing placed is open: the first open "Any day" session. */
  | "any-day"
  /** Placed on that weekday, but already logged. */
  | "logged"
  /** Nothing fits: the week's first session. */
  | "first";

export interface SessionPick {
  week: number;
  sessionId: string;
  why: PickWhy;
}

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS;
const isoOfDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** ISO weekday (1=Mon…7=Sun) of a YYYY-MM-DD date. */
export const isoWeekday = (iso: string): number => ((new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

function anchorDay(program: DateProgram, logs: DateLog[]): number {
  const anchor = blockAnchorDate(
    { id: program.id, activatedAt: program.activatedAt, createdAt: program.createdAt, clientId: null, name: "", status: "", weeks: [] },
    logs.map((l) => ({ programId: l.programId, date: l.date, sets: [] }))
  );
  return dayNumber(anchor);
}

/** The week's sessions as the picker lists them: Mon→Sun, then "Any day". */
export function sessionsInPickerOrder<S extends DateSession>(sessions: readonly S[]): S[] {
  const by = sessionsByWeekday(sessions);
  return [1, 2, 3, 4, 5, 6, 7, 0].flatMap((d) => by.get(d) ?? []);
}

/** The program week a date falls in: before the anchor → the first week, past the end → the last. */
export function weekForDate(program: DateProgram, logs: DateLog[], date: string): number {
  const weeks = program.weeks.map((w) => w.week).sort((a, b) => a - b);
  if (weeks.length === 0) return 1;
  const n = Math.max(1, Math.floor((dayNumber(date) - anchorDay(program, logs)) / 7) + 1);
  return [...weeks].reverse().find((w) => w <= n) ?? weeks[0];
}

/** A placed session's calendar day inside its week window; null for "Any day". */
export function scheduledDate(program: DateProgram, logs: DateLog[], week: number, session: Pick<DateSession, "weekday">): string | null {
  if (!session.weekday) return null;
  const start = anchorDay(program, logs) + 7 * (week - 1);
  const offset = (session.weekday - isoWeekday(isoOfDay(start)) + 7) % 7;
  return isoOfDay(start + offset);
}

const isLogged = (logs: DateLog[], sessionId: string) => logs.some((l) => l.programSessionId === sessionId);

/**
 * The session a date most likely logs. In the week holding the date: an open
 * session placed that weekday, else the first open one placed earlier in the
 * week, else an open "Any day" one, else the (logged) one placed that weekday,
 * else the week's first.
 */
export function sessionForDate(program: DateProgram, logs: DateLog[], date: string): SessionPick | null {
  const week = weekForDate(program, logs, date);
  const sessions = sessionsInPickerOrder(program.weeks.find((w) => w.week === week)?.sessions ?? []);
  if (sessions.length === 0) return null;
  const day = isoWeekday(date);
  const open = sessions.filter((s) => !isLogged(logs, s.id));
  const pick = (s: DateSession | undefined, why: PickWhy) => (s ? { week, sessionId: s.id, why } : null);
  return (
    pick(open.find((s) => s.weekday === day), "scheduled") ??
    pick(
      open.find((s) => {
        const d = scheduledDate(program, logs, week, s);
        return d != null && d < date.slice(0, 10);
      }),
      "earlier"
    ) ??
    pick(open.find((s) => !s.weekday), "any-day") ??
    pick(sessions.find((s) => s.weekday === day), "logged") ??
    pick(sessions[0], "first")
  );
}

/**
 * The date a session logs on: its scheduled day in its week window, capped at
 * today (a future date is always a mistake). "Any day" → null: keep the date.
 */
export function dateForSession(
  program: DateProgram,
  logs: DateLog[],
  week: number,
  sessionId: string,
  today: string
): { date: string; scheduled: string; capped: boolean } | null {
  const session = program.weeks.find((w) => w.week === week)?.sessions.find((s) => s.id === sessionId);
  const scheduled = session ? scheduledDate(program, logs, week, session) : null;
  if (!scheduled) return null;
  return scheduled > today ? { date: today, scheduled, capped: true } : { date: scheduled, scheduled, capped: false };
}

/** How far back the page-open default looks for a missed session. */
export const OPEN_LOOKBACK_DAYS = 7;

/**
 * What the page opens on: the most recent session scheduled in the last week
 * (today included) that isn't logged yet, on its scheduled day. With none,
 * whatever `sessionForDate` picks for today.
 */
export function openingPick(
  program: DateProgram,
  logs: DateLog[],
  today: string
): (SessionPick & { date: string }) | null {
  const floor = isoOfDay(dayNumber(today) - (OPEN_LOOKBACK_DAYS - 1));
  let best: (SessionPick & { date: string }) | null = null;
  for (const w of [...program.weeks].sort((a, b) => a.week - b.week)) {
    for (const s of sessionsInPickerOrder(w.sessions)) {
      const d = scheduledDate(program, logs, w.week, s);
      if (!d || d > today || d < floor || isLogged(logs, s.id)) continue;
      if (!best || d > best.date) best = { week: w.week, sessionId: s.id, why: "scheduled", date: d };
    }
  }
  if (best) return best;
  const pick = sessionForDate(program, logs, today);
  return pick ? { ...pick, date: today } : null;
}
