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

/**
 * A planned session's state on its date. `unlogged` is the grace period: a past
 * session not logged yet but within `GRACE_DAYS` of today (clients report late,
 * trainers log in batches); only older ones are `missed`.
 */
export type SessionStatus = "logged" | "missed" | "unlogged" | "today" | "upcoming";
export type DayStatus = SessionStatus | "rest" | "before-start";

export interface StripSession {
  /** Program session id; null for a log no current-program session names. */
  id: string | null;
  name: string;
  status: SessionStatus;
  /** False for a log on a day that had nothing of its own planned. */
  planned: boolean;
  /** From the program session, or the log for an unplanned extra. */
  kind: "lifting" | "cardio";
  /** Set when a planned session was logged on another day of its week. */
  loggedOn?: string;
}

export interface StripDay {
  date: string;
  /** 1=Mon … 7=Sun */
  weekday: number;
  /** missed > unlogged > today > upcoming > logged; rest = nothing planned or logged;
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

/** missed → not logged yet → due today → on track → nothing this week. Missed and not-logged
 *  look back `LOOKBACK_DAYS` (so Monday still sees last Fri–Sun); the rest read this week. */
export type ClientException = "missed" | "unlogged" | "today" | "on-track" | "none";

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

/** Days after its date a planned session stays `unlogged` before it reads as `missed`. */
export const GRACE_DAYS = 2;

/** Days the exception sort and the counter look back for missed / not-logged days, today excluded:
 *  this week's past days always fall inside, and on Monday last Tue–Sun carry over. */
export const LOOKBACK_DAYS = 7;

/** Calendar date `days` away from an ISO date (local, DST-safe). */
export function addDays(iso: string, days: number): string {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + days);
  return localIso(d);
}

/** `count` calendar weeks (Mon→Sun dates) ending with the week containing `now`, oldest first. */
export function stripWeeks(now: Date, count = 6): string[][] {
  const current = weekDatesOf(now);
  return Array.from({ length: count }, (_, i) => current.map((d) => addDays(d, -7 * (count - 1 - i))));
}

const STATUS_RANK: SessionStatus[] = ["missed", "unlogged", "today", "upcoming", "logged"];

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
 * A past session not logged is `unlogged` for `GRACE_DAYS`, then `missed`.
 */
export function buildClientStrip(
  client: ClientDto,
  program: ProgramDto | null,
  logs: SessionLogDto[],
  weeks: string[][],
  today: string
): ClientStrip {
  const currentWeek = weeks[weeks.length - 1];
  const graceFrom = addDays(today, -GRACE_DAYS);
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
          const status: SessionStatus = logged
            ? "logged"
            : date === today
              ? "today"
              : date > today
                ? "upcoming"
                : date >= graceFrom
                  ? "unlogged"
                  : "missed";
          sessions.push({
            id: s.id,
            name: s.name,
            status,
            planned: true,
            kind: s.kind === "cardio" ? "cardio" : "lifting",
            ...(on && on !== date ? { loggedOn: on } : {}),
          });
        }
        for (const l of dayLogs) {
          const sl = l.programId === program?.id && l.programSessionId ? slotById.get(l.programSessionId) : undefined;
          const covers = l.programId === program?.id && (sl ? plannedSlots.has(sl) : sessions.length > 0);
          if (!covers)
            sessions.push({
              id: (sl && l.programSessionId) || null,
              name: extraName(l),
              status: "logged",
              planned: false,
              kind: l.kind === "cardio" ? "cardio" : "lifting",
            });
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
  const recent = recentDays(strip, today);
  strip.exception = recent.some((d) => d.status === "missed")
    ? "missed"
    : recent.some((d) => d.status === "unlogged")
      ? "unlogged"
      : now.some((d) => d.status === "today")
        ? "today"
        : now.some((d) => d.sessions.some((s) => s.planned)) || strip.unscheduled > 0
          ? "on-track"
          : "none";
  return strip;
}

/** The look-back window: the `LOOKBACK_DAYS` before today, oldest first. */
function recentDays(strip: ClientStrip, today: string): StripDay[] {
  const from = addDays(today, -LOOKBACK_DAYS);
  return strip.weeks.flat().filter((d) => d.date >= from && d.date < today);
}

const EXCEPTION_RANK: Record<ClientException, number> = { missed: 0, unlogged: 1, today: 2, "on-track": 3, none: 4 };

/** Exceptions first: missed → not logged → due today → on track → nothing this week; roster order within each. */
export function exceptionOrder(strips: ClientStrip[]): ClientStrip[] {
  return [...strips].sort((a, b) => EXCEPTION_RANK[a.exception] - EXCEPTION_RANK[b.exception]);
}

/** This week's planned sessions across clients. */
export function weekTally(strips: ClientStrip[]): {
  logged: number;
  planned: number;
  dueToday: number;
  unlogged: number;
  missed: number;
} {
  const t = { logged: 0, planned: 0, dueToday: 0, unlogged: 0, missed: 0 };
  for (const s of strips) {
    for (const d of s.weeks[s.weeks.length - 1] ?? []) {
      for (const x of d.sessions) {
        if (!x.planned) continue;
        t.planned += 1;
        if (x.status === "logged") t.logged += 1;
        else if (x.status === "today") t.dueToday += 1;
        else if (x.status === "unlogged") t.unlogged += 1;
        else if (x.status === "missed") t.missed += 1;
      }
    }
  }
  return t;
}

/**
 * Client-days (cells) by state — what the grid draws, one per day: this week's
 * cells, plus `carried` missed / not-logged days from last week that fall in the
 * look-back window (on Monday, last Tue–Sun; they show in the latest history week).
 */
export function weekDayTally(
  strips: ClientStrip[],
  today: string
): { missed: number; unlogged: number; today: number; planned: number; carried: { missed: number; unlogged: number } } {
  const t = { missed: 0, unlogged: 0, today: 0, planned: 0, carried: { missed: 0, unlogged: 0 } };
  for (const s of strips) {
    const thisWeek = s.weeks[s.weeks.length - 1] ?? [];
    for (const d of thisWeek) {
      if (d.sessions.some((x) => x.planned)) t.planned += 1;
      if (d.status === "missed") t.missed += 1;
      else if (d.status === "unlogged") t.unlogged += 1;
      else if (d.status === "today") t.today += 1;
    }
    for (const d of recentDays(s, today)) {
      if (d.date >= (thisWeek[0]?.date ?? "")) continue;
      if (d.status === "missed") t.carried.missed += 1;
      else if (d.status === "unlogged") t.carried.unlogged += 1;
    }
  }
  return t;
}

/**
 * The Training week counter: client-days that need the trainer, counted like
 * the cells ("2 missed · 3 to log · 2 from last week · 1 due today"; zero parts
 * omitted), toned red when anything is missed — this week or carried — amber
 * when only logging is behind. Undefined when nothing is planned or carried.
 */
export function weekCounter(strips: ClientStrip[], today: string): { label: string; tone?: "bad" | "warn" } | undefined {
  const t = weekDayTally(strips, today);
  const carried = t.carried.missed + t.carried.unlogged;
  const parts = [
    t.missed ? `${t.missed} missed` : null,
    t.unlogged ? `${t.unlogged} to log` : null,
    carried ? `${carried} from last week` : null,
    t.today ? `${t.today} due today` : null,
  ].filter((p): p is string => !!p);
  const tone = t.missed || t.carried.missed ? "bad" : t.unlogged || t.carried.unlogged ? "warn" : undefined;
  if (parts.length) return { label: parts.join(" · "), tone };
  return t.planned ? { label: "all on track" } : undefined;
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
  unlogged: "not logged",
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

/** Why a client has no sessions this week, as a short label: their status when not active, else no program / nothing planned. */
export function idleReason(s: ClientStrip): string {
  if (s.client.status && s.client.status !== "active") return s.client.status;
  return s.program ? "nothing planned" : "no program";
}
