import {
  blockAnchorDate,
  blockWeekOfDate,
  cardioDone,
  cardioUnitLabel,
  cardioWeekTotals,
  dayIntensityLevels,
  dayVolume,
  sessionsByWeekday,
  timedExerciseIds,
  type DayVolume,
} from "@pt/shared";
import type { ClientDto, ProgramDto, SessionLogDto } from "$lib/api/types";

export type SessionStatus = "logged" | "missed" | "today" | "upcoming";
export type DayStatus = SessionStatus | "rest" | "before-start";

export interface StripSession {
  /** Program session id; null for a log no current-program session names. */
  id: string | null;
  name: string;
  status: SessionStatus;
  /** False for a log on a day that had nothing of its own planned. */
  planned: boolean;
  /** Set when a planned session was logged on another day of its week. */
  loggedOn?: string;
}

export interface StripDay {
  date: string;
  /** 1=Mon … 7=Sun */
  weekday: number;
  /** missed > today > upcoming > logged; rest = nothing planned or logged;
   *  before-start = nothing logged before the block / client began (never missed). */
  status: DayStatus;
  sessions: StripSession[];
  /** What was logged on this date; null when nothing was. */
  volume: DayVolume | null;
  /** 0 = nothing logged, 1–4 = vs the client's usual day (see `dayIntensityLevels`). */
  level: 0 | 1 | 2 | 3 | 4;
  /** The session the logger opens on: the day's first planned session not logged yet. */
  openSessionId?: string;
}

/** missed → due today → on track → nothing this week, decided by the current week. */
export type ClientException = "missed" | "today" | "on-track" | "none";

export interface ClientStrip {
  client: ClientDto;
  program: string | null;
  /** Calendar weeks oldest → current, seven days each. */
  weeks: StripDay[][];
  /** This week's sessions with no weekday ("any day") — they get no cell. */
  unscheduled: number;
  /** This week's cardio progress vs the client target — hidden when unset. */
  cardio?: { done: number; target: number; unitLabel: string } | null;
  exception: ClientException;
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

/** Calendar date `days` away from an ISO date (local, DST-safe). */
function addDays(iso: string, days: number): string {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + days);
  return localIso(d);
}

/** `count` calendar weeks (Mon→Sun dates) ending with the week containing `now`, oldest first. */
export function stripWeeks(now: Date, count = 6): string[][] {
  const current = weekDatesOf(now);
  return Array.from({ length: count }, (_, i) => current.map((d) => addDays(d, -7 * (count - 1 - i))));
}

const STATUS_RANK: SessionStatus[] = ["missed", "today", "upcoming", "logged"];

/**
 * One client's contributions strip: every day of `weeks`, its planned sessions
 * and what was logged, shaded by logged volume against the client's usual day.
 *
 * Planned sessions come from the current program week matching each calendar
 * week (same anchor as the logger). A session counts as logged when a log in
 * the same calendar week names its slot (kind + session number) in any program
 * week (F08); logs without a resolvable session satisfy their own date.
 * Nothing before the block anchor or the client's creation is ever missed —
 * those days show logs only (F07). Logs from other programs show as logged.
 */
export function buildClientStrip(
  client: ClientDto,
  program: ProgramDto | null,
  logs: SessionLogDto[],
  weeks: string[][],
  today: string
): ClientStrip {
  const currentWeek = weeks[weeks.length - 1];
  const strip: ClientStrip = { client, program: program?.name ?? null, weeks: [], unscheduled: 0, exception: "none" };
  if (client.cardioTarget) {
    strip.cardio = {
      done: cardioDone(client.cardioTarget, cardioWeekTotals(logs, currentWeek[0])),
      target: client.cardioTarget.value,
      unitLabel: cardioUnitLabel(client.cardioTarget.unit),
    };
  }

  const hasPlan = !!program?.weeks?.length;
  const programLogs = program ? logs.filter((l) => l.programId === program.id) : [];
  const anchorDay = program ? blockAnchorDate(program, programLogs).slice(0, 10) : null;
  const clientDay = client.createdAt ? localIso(new Date(client.createdAt)) : null;
  const startDay = anchorDay && clientDay && clientDay > anchorDay ? clientDay : anchorDay;

  const slot = (s: { kind?: string | null; seq: number }) => `${s.kind ?? "lifting"}:${s.seq}`;
  const allSessions = program?.weeks?.flatMap((w) => w.sessions) ?? [];
  const slotById = new Map(allSessions.map((s) => [s.id, slot(s)] as const));
  const nameById = new Map(allSessions.map((s) => [s.id, s.name] as const));
  const timed = program ? timedExerciseIds(program) : new Set<string>();
  const logsByDate = new Map<string, SessionLogDto[]>();
  for (const l of logs) {
    const d = l.date.slice(0, 10);
    logsByDate.set(d, [...(logsByDate.get(d) ?? []), l]);
  }
  const extraName = (l: SessionLogDto) =>
    (l.programSessionId && nameById.get(l.programSessionId)) || (l.kind === "cardio" ? "Logged cardio" : "Logged session");

  for (const dates of weeks) {
    const inWeek = programLogs.filter((l) => l.date.slice(0, 10) >= dates[0] && l.date.slice(0, 10) <= dates[6]);
    /** slot → the date it was logged on this week */
    const slotLoggedOn = new Map<string, string>();
    for (const l of [...inWeek].sort((a, b) => a.date.localeCompare(b.date))) {
      const sl = l.programSessionId ? slotById.get(l.programSessionId) : undefined;
      if (sl && !slotLoggedOn.has(sl)) slotLoggedOn.set(sl, l.date.slice(0, 10));
    }
    const unresolvedDates = new Set(
      inWeek.filter((l) => !l.programSessionId || !slotById.has(l.programSessionId)).map((l) => l.date.slice(0, 10))
    );

    let byDay = new Map<number, NonNullable<ProgramDto["weeks"]>[number]["sessions"]>();
    if (hasPlan && program) {
      // The block week this calendar week is "in", read on today's weekday — like the logger.
      const probe = addDays(today, -7 * (weeks.length - 1 - weeks.indexOf(dates)));
      const weekNum = Math.max(1, Math.min(blockWeekOfDate(program, programLogs, probe), program.weeks.length));
      const week = program.weeks.find((w) => w.week === weekNum) ?? program.weeks[0];
      byDay = sessionsByWeekday(week.sessions);
      if (dates === currentWeek) strip.unscheduled = byDay.get(0)?.length ?? 0;
    }

    strip.weeks.push(
      dates.map((date, i): StripDay => {
        const weekday = i + 1;
        const dayLogs = logsByDate.get(date) ?? [];
        const due = !startDay || date >= startDay;
        const sessions: StripSession[] = [];
        const plannedSlots = new Set<string>();
        for (const s of byDay.get(weekday) ?? []) {
          const on = slotLoggedOn.get(slot(s));
          const logged = on !== undefined || unresolvedDates.has(date);
          if (!logged && !due) continue;
          plannedSlots.add(slot(s));
          const status: SessionStatus = logged ? "logged" : date === today ? "today" : date < today ? "missed" : "upcoming";
          sessions.push({ id: s.id, name: s.name, status, planned: true, ...(on && on !== date ? { loggedOn: on } : {}) });
        }
        for (const l of dayLogs) {
          const sl = l.programId === program?.id && l.programSessionId ? slotById.get(l.programSessionId) : undefined;
          const covers = l.programId === program?.id && (sl ? plannedSlots.has(sl) : sessions.length > 0);
          if (!covers) sessions.push({ id: (sl && l.programSessionId) || null, name: extraName(l), status: "logged", planned: false });
        }
        const worst = STATUS_RANK.find((st) => sessions.some((s) => s.status === st));
        const status: DayStatus = worst ?? (due ? "rest" : "before-start");
        const open = sessions.find((s) => s.planned && s.status !== "logged");
        return {
          date,
          weekday,
          status,
          sessions,
          volume: date <= today ? dayVolume(dayLogs, timed) : null,
          level: 0,
          ...(open?.id ? { openSessionId: open.id } : {}),
        };
      })
    );
  }

  const days = strip.weeks.flat();
  const levels = dayIntensityLevels(days.map((d) => d.volume));
  days.forEach((d, i) => {
    d.level = d.status === "logged" && levels[i] === 0 ? 1 : levels[i];
  });

  const now = strip.weeks[strip.weeks.length - 1];
  strip.exception = now.some((d) => d.status === "missed")
    ? "missed"
    : now.some((d) => d.status === "today")
      ? "today"
      : now.some((d) => d.sessions.some((s) => s.planned)) || strip.unscheduled > 0
        ? "on-track"
        : "none";
  return strip;
}

const EXCEPTION_RANK: Record<ClientException, number> = { missed: 0, today: 1, "on-track": 2, none: 3 };

/** Exceptions first: missed → due today → on track → nothing this week; roster order within each. */
export function exceptionOrder(strips: ClientStrip[]): ClientStrip[] {
  return [...strips].sort((a, b) => EXCEPTION_RANK[a.exception] - EXCEPTION_RANK[b.exception]);
}

/** This week's planned sessions across clients. */
export function weekTally(strips: ClientStrip[]): { logged: number; planned: number; dueToday: number; missed: number } {
  const t = { logged: 0, planned: 0, dueToday: 0, missed: 0 };
  for (const s of strips) {
    for (const d of s.weeks[s.weeks.length - 1] ?? []) {
      for (const x of d.sessions) {
        if (!x.planned) continue;
        t.planned += 1;
        if (x.status === "logged") t.logged += 1;
        else if (x.status === "today") t.dueToday += 1;
        else if (x.status === "missed") t.missed += 1;
      }
    }
  }
  return t;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "Mon, Oct 26" (`long` → "Monday, Oct 26"). */
export function dayDateLabel(iso: string, long = false): string {
  const wd = (new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).getDay() + 6) % 7;
  const name = long ? WEEKDAYS[wd] : WEEKDAYS[wd].slice(0, 3);
  return `${name}, ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

/** "4,250 kg", "12 sets", "40 min", "1 session". */
export function volumeLabel(v: DayVolume): string {
  const n = Math.round(v.amount).toLocaleString("en-US");
  if (v.basis === "tonnage") return `${n} kg`;
  if (v.basis === "minutes") return `${n} min`;
  return plural(Math.round(v.amount), v.basis === "sets" ? "set" : "session");
}

export const LEVEL_WORDS = ["", "light day", "below usual", "usual day", "big day"] as const;

export const SESSION_WORDS: Record<SessionStatus, string> = {
  logged: "logged",
  missed: "missed",
  today: "due today",
  upcoming: "upcoming",
};

/** The session's line in a label or popover: "Upper — logged Tue, Nov 3". */
export function sessionLine(s: StripSession): string {
  return `${s.name} ${s.loggedOn ? `logged ${dayDateLabel(s.loggedOn)}` : SESSION_WORDS[s.status]}`;
}

/** Full-sentence accessible name for one day square or cell. */
export function daySentence(clientName: string, d: StripDay): string {
  const head = `${clientName}, ${dayDateLabel(d.date, true)}`;
  if (d.sessions.length === 0) return `${head}: nothing planned.`;
  const vol = d.volume ? ` — ${volumeLabel(d.volume)}, ${LEVEL_WORDS[d.level]}` : "";
  return `${head}: ${d.sessions.map(sessionLine).join("; ")}${vol}.`;
}
