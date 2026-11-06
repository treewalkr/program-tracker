import { cardioDone, cardioUnitLabel, cardioWeekTotals, sessionsByWeekday, weekOf } from "@pt/shared";
import type { ClientDto, ProgramDto, SessionLogDto } from "$lib/api/types";

export interface WeekEntry {
  day: number; // 1=Mon … 7=Sun
  clientId: string;
  /** Every session on the day, " + "-joined (first one names the cell). */
  sessionName: string;
  /** Sessions placed on the day; > 1 shows the count in the cell corner. Defaults to 1. */
  count?: number;
  status: "logged" | "due" | "today" | "upcoming";
}

export interface ClientRow {
  client: ClientDto;
  program: string | null;
  entries: Map<number, WeekEntry>;
  /** This week's sessions with no weekday ("any day") — they get no cell. */
  unscheduled?: number;
  /** This week's cardio progress vs the client target — hidden when unset. */
  cardio?: { done: number; target: number; unitLabel: string } | null;
}

/** Local calendar date as YYYY-MM-DD. `toISOString()` is UTC and reads as
 *  yesterday before 07:00 in +07:00 — never use it for calendar days. */
export function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The seven local dates (Mon→Sun) of the week containing `now`. */
export function weekDatesOf(now: Date): string[] {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localIso(d);
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 2–8", or "Oct 27 – Nov 2" when the week crosses a month. */
export function weekRangeLabel(weekDates: string[]): string {
  const [a, b] = [weekDates[0], weekDates[6]];
  const ma = MONTHS[Number(a.slice(5, 7)) - 1];
  const mb = MONTHS[Number(b.slice(5, 7)) - 1];
  const da = Number(a.slice(8, 10));
  const db = Number(b.slice(8, 10));
  return ma === mb ? `${ma} ${da}–${db}` : `${ma} ${da} – ${mb} ${db}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * One training-week row: the current program week's sessions on their
 * weekdays, each day marked logged / today / due (missed) / upcoming.
 * A session counts as logged when a log this week names it, wherever in the
 * week it happened; logs without a session id fall back to the planned date.
 */
export function buildWeekRow(
  client: ClientDto,
  program: ProgramDto | null,
  logs: SessionLogDto[],
  weekDates: string[],
  today: string,
  now = Date.now()
): ClientRow {
  const row: ClientRow = { client, program: program?.name ?? null, entries: new Map(), unscheduled: 0 };
  if (client.cardioTarget) {
    row.cardio = {
      done: cardioDone(client.cardioTarget, cardioWeekTotals(logs, weekDates[0])),
      target: client.cardioTarget.value,
      unitLabel: cardioUnitLabel(client.cardioTarget.unit),
    };
  }
  if (!program || !program.weeks?.length) return row;

  const weekNum = Math.max(1, Math.min(weekOf(program, logs, now), program.weeks.length));
  const week = program.weeks.find((w) => w.week === weekNum) ?? program.weeks[0];
  const thisWeek = logs.filter((l) => l.programId === program.id && l.date.slice(0, 10) >= weekDates[0] && l.date.slice(0, 10) <= weekDates[6]);
  const loggedIds = new Set(thisWeek.map((l) => l.programSessionId).filter(Boolean));
  const loggedDates = new Set(thisWeek.filter((l) => !l.programSessionId).map((l) => l.date.slice(0, 10)));

  const byDay = sessionsByWeekday(week.sessions);
  row.unscheduled = byDay.get(0)?.length ?? 0;
  for (let day = 1; day <= 7; day++) {
    const list = byDay.get(day) ?? [];
    if (list.length === 0) continue;
    const date = weekDates[day - 1];
    const logged = list.every((s) => loggedIds.has(s.id)) || loggedDates.has(date);
    row.entries.set(day, {
      day,
      clientId: client.id,
      sessionName: list.map((s) => s.name).join(" + "),
      count: list.length,
      status: logged ? "logged" : date === today ? "today" : date < today ? "due" : "upcoming",
    });
  }
  return row;
}
