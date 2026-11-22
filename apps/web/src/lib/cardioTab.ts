import { distanceUnit, fmtDistance, fmtPace, fmtSpeed, showDistance } from "./units.svelte";
import {
  addDays,
  cardioLogSec,
  cardioPace,
  cardioTotals,
  cardioWeekTotals,
  isSkippedCardio,
  sessionLoad,
  zoneBpm,
  type CardioLog,
  type CardioMetric,
  type CardioPrescription,
  type LogPrescription,
  type ProgramSession,
} from "@pt/shared";
import { formatDuration } from "$lib/ui/input/duration";
import { INTERVAL_TYPE_LABEL, SKIP_REASON_LABEL } from "$lib/cardioForm";

/**
 * The member page's Cardio tab, built only from saved logs (and the program
 * for what was planned). Pure: the tab and `CardioReview` render these.
 */

type Log = {
  id: string;
  date: string;
  kind: string;
  programId: string;
  programSessionId: string | null;
  cardio?: CardioLog | null;
  prescription?: LogPrescription | null;
  reviewedAt?: string | null;
  trainerFeedback?: string | null;
  loggedBy?: string;
  notes?: string | null;
};
type Program = { id: string; startsOn: string | null; weeks: { week: number; sessions: ProgramSession[] }[] };

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "12 Oct" */
export const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${SHORT_MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** "Sat 21 Nov" */
export const dayLabel = (iso: string) => {
  const wd = (new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7;
  return `${DAY_NAMES[wd]} ${dayMonth(iso)}`;
};

/** "2:15" (h:mm) for a minute total. */
export const hoursMinutes = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`;

const isCardio = (l: Log) => l.kind === "cardio" && !!l.cardio;
const day = (iso: string) => iso.slice(0, 10);

export interface CardioWeek {
  /** Monday, YYYY-MM-DD. */
  start: string;
  label: string;
  load: number;
  minutes: number;
  sessions: number;
}

/** Session load, minutes and sessions for each of the last `count` calendar weeks, oldest first. */
export function cardioWeeks(logs: readonly Log[], thisMonday: string, count = 6): CardioWeek[] {
  const rows = logs.filter(isCardio).map((l) => ({ kind: "cardio" as const, date: day(l.date), cardio: l.cardio! }));
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(thisMonday, -7 * (count - 1 - i));
    const end = addDays(start, 7);
    const t = cardioWeekTotals(rows.filter((r) => r.date < end), start);
    return { start, label: dayMonth(start), load: t.load, minutes: t.minutes, sessions: t.sessions };
  });
}

/** The program's cardio sessions dated between `from` and `to` (inclusive), by their week and weekday. */
export function plannedCardio(program: Program | null | undefined, from: string, to: string): { session: ProgramSession; date: string | null }[] {
  if (!program?.startsOn) return [];
  const out: { session: ProgramSession; date: string | null }[] = [];
  for (const w of program.weeks) {
    const monday = addDays(program.startsOn, (w.week - 1) * 7);
    if (addDays(monday, 6) < from || monday > to) continue;
    for (const s of w.sessions) {
      if (s.kind !== "cardio") continue;
      const date = s.weekday ? addDays(monday, s.weekday - 1) : null;
      // an unscheduled one counts in its week once the week has started
      if (date ? date >= from && date <= to : monday <= to && addDays(monday, 6) >= from) out.push({ session: s, date });
    }
  }
  return out;
}

export interface CardioTiles {
  /** Done (completed, not skipped) this week, of the planned. */
  sessions: { done: number; planned: number };
  /** Minutes done this week vs the plan's. */
  minutes: { done: number; planned: number | null };
  load: number;
  /** Planned cardio due in the last four weeks (up to today) that has a completed log. */
  completion: { done: number; due: number; pct: number | null };
}

export function cardioTiles(logs: readonly Log[], program: Program | null | undefined, thisMonday: string, today: string): CardioTiles {
  const rows = logs.filter(isCardio).map((l) => ({ kind: "cardio" as const, date: day(l.date), cardio: l.cardio! }));
  const week = cardioWeekTotals(rows, thisMonday);
  const planned = plannedCardio(program, thisMonday, addDays(thisMonday, 6));
  const plannedSec = planned.reduce((n, p) => n + (p.session.cardio ? (cardioTotals(p.session.cardio).durationSec ?? 0) : 0), 0);

  const from = addDays(thisMonday, -21);
  const due = plannedCardio(program, from, today);
  const done = new Set(
    logs.filter((l) => isCardio(l) && !isSkippedCardio(l.cardio) && l.programId === program?.id && l.programSessionId && day(l.date) >= from).map((l) => l.programSessionId!),
  );
  const doneCount = due.filter((p) => done.has(p.session.id)).length;
  return {
    sessions: { done: week.sessions, planned: planned.length },
    minutes: { done: week.minutes, planned: plannedSec ? Math.round(plannedSec / 60) : null },
    load: week.load,
    completion: { done: doneCount, due: due.length, pct: due.length ? Math.round((doneCount / due.length) * 100) : null },
  };
}

/** Distance per modality this week, never added across modalities. */
export function distanceByModality(logs: readonly Log[], thisMonday: string): { modality: string; sessions: number; distanceKm: number }[] {
  const rows = logs.filter(isCardio).map((l) => ({ kind: "cardio" as const, date: day(l.date), cardio: l.cardio! }));
  const t = cardioWeekTotals(rows, thisMonday);
  return Object.entries(t.byModality)
    .map(([modality, m]) => ({ modality, sessions: m.sessions, distanceKm: m.distanceKm }))
    .sort((a, b) => b.sessions - a.sessions || a.modality.localeCompare(b.modality));
}

export type ReviewState = "to_review" | "reviewed" | "skipped";

export interface CardioLogRow {
  id: string;
  date: string;
  title: string;
  facts: string;
  state: ReviewState;
  byMember: boolean;
  /** Pain reported on the log, or the session skipped for pain: the coach should see it at a glance. */
  pain: boolean;
}

/** Cardio logs newest first, with what each still needs. */
export function cardioLogRows(logs: readonly Log[]): CardioLogRow[] {
  return logs
    .filter(isCardio)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((l) => {
      const c = l.cardio!;
      const title = l.prescription?.session.name ?? c.modality;
      const skipped = isSkippedCardio(c);
      const sec = cardioLogSec(c);
      const load = sessionLoad(c);
      const facts = skipped
        ? `Not done · ${SKIP_REASON_LABEL[c.skipped!.reason]}`
        : [c.modality, sec != null ? formatDuration(sec) : null, c.distanceKm ? fmtDistance(c.distanceKm) : null, c.rpe != null ? `RPE ${c.rpe}` : null, load != null ? `${load} AU` : null]
            .filter(Boolean)
            .join(" · ");
      return { id: l.id, date: day(l.date), title, facts, state: skipped ? "skipped" : l.reviewedAt ? "reviewed" : "to_review", byMember: l.loggedBy === "client", pain: !!c.pain?.reported || c.skipped?.reason === "pain" };
    });
}

// ---------------------------------------------------------------------------
// CardioReview: plan vs actual
// ---------------------------------------------------------------------------

export interface ReviewRow {
  label: string;
  plan: string;
  actual: string;
  /** Small text after the actual ("calc", "7 × 35.2 min"). */
  aside?: string;
  /** Shown under the row. */
  note?: string;
  /** The actual is missing data rather than a value. */
  insufficient?: boolean;
}

const dash = "—";
/** "5.20 km" / "3.23 mi" — two decimals, so plan and actual line up. */
const km2 = (km: number) => `${showDistance(km).toFixed(2)} ${distanceUnit()}`;
const paceText = (p: ReturnType<typeof cardioPace>) =>
  p?.metric === "pace" ? fmtPace(p.secPerKm) : p?.metric === "split" ? `${formatDuration(p.secPer500m)} /500 m` : p?.metric === "speed" ? fmtSpeed(p.kmh) : null;

function planZone(rx: CardioPrescription, zones: LogPrescription["zonesBpm"]): string | null {
  const work = rx.intervals?.find((i) => i.type === "work" && i.hrZone != null);
  const z = work?.hrZone ?? rx.hrZone ?? null;
  if (z == null) return null;
  const b = zoneBpm(zones, z);
  return `Z${z}${work ? " work" : ""}${b ? ` · ${b.min}–${b.max}` : ""}`;
}

/**
 * Plan vs actual, row by row. The plan is the snapshot saved with the log,
 * so later program edits don't change it; null plan = a freestyle log.
 */
export function reviewRows(cardio: CardioLog, plan: LogPrescription | null | undefined, metric: CardioMetric): ReviewRow[] {
  const rx = plan?.session.cardio ?? null;
  const totals = rx ? cardioTotals(rx) : null;
  const sec = cardioLogSec(cardio);
  const rows: ReviewRow[] = [];

  rows.push({ label: "Duration", plan: totals?.durationSec ? formatDuration(totals.durationSec) : dash, actual: sec != null ? formatDuration(sec) : dash });
  const planKm = rx?.distanceKm ?? (totals && totals.distanceM > 0 ? totals.distanceM / 1000 : null);
  rows.push({ label: "Distance", plan: planKm ? km2(planKm) : dash, actual: cardio.distanceKm ? km2(cardio.distanceKm) : dash });

  const pace = paceText(cardioPace(cardio, metric));
  if (pace || rx?.paceSecPerKm) {
    rows.push({ label: metric === "split" ? "Average split" : metric === "speed" ? "Average speed" : "Average pace", plan: rx?.paceSecPerKm ? fmtPace(rx.paceSecPerKm) : dash, actual: pace ?? dash, aside: pace ? "calc" : undefined });
  }

  const zone = rx ? planZone(rx, plan?.zonesBpm) : null;
  if (zone || cardio.avgHr || cardio.maxHr) {
    const hr = [cardio.avgHr ? `avg ${cardio.avgHr}` : null, cardio.maxHr ? `max ${cardio.maxHr}` : null].filter(Boolean).join(" · ");
    rows.push({
      label: "Heart rate",
      plan: zone ?? dash,
      actual: hr || dash,
      note: rx?.intervals?.length && cardio.avgHr ? "The average includes warm-up and recovery, so it isn't compared with the work zone." : undefined,
    });
  }

  rows.push({ label: "Session RPE", plan: rx?.targetRpe != null ? String(rx.targetRpe) : dash, actual: cardio.rpe != null ? String(cardio.rpe) : dash });
  const load = sessionLoad(cardio);
  rows.push({
    label: "Session load",
    plan: dash,
    actual: load != null ? `${load} AU` : dash,
    aside: load != null && sec != null ? `${cardio.rpe} × ${Math.round((sec / 60) * 10) / 10} min` : undefined,
  });

  const work = rx?.intervals?.filter((i) => i.type === "work") ?? [];
  if (work.length) {
    const planWork = work.map((i) => `${i.repeat ?? 1} × ${i.durationSec ? formatDuration(i.durationSec) : i.distanceM ? `${i.distanceM} m` : "?"}`).join(", ");
    const results = (cardio.intervals ?? []).filter((r) => work.some((w) => w.id === r.intervalId));
    const timed = results.filter((r) => r.durationSec != null);
    rows.push(
      results.length
        ? {
            label: "Work reps",
            plan: planWork,
            actual: timed.length ? timed.map((r) => formatDuration(r.durationSec!)).join(" · ") : `${results.length} reported`,
            aside: timed.length ? `${timed.length} of ${work.reduce((n, w) => n + (w.repeat ?? 1), 0)} timed` : undefined,
          }
        : { label: "Work reps", plan: planWork, actual: "Insufficient data", aside: "no per-interval results", insufficient: true },
    );
  }
  return rows;
}

/** "Plan as assigned · program v4" — where the plan side comes from. */
export function planSource(plan: LogPrescription | null | undefined): string {
  if (!plan) return "Freestyle — no plan to compare with";
  return `Plan as assigned · program v${plan.programVersion}${plan.hrProfileVersion ? ` · HR zones v${plan.hrProfileVersion}` : ""}`;
}

/** The intervals as planned, one line each ("Work 5 × 2:00 · Z5"). */
export function planIntervals(rx: CardioPrescription | null | undefined): string[] {
  return (rx?.intervals ?? []).map((i) => {
    const what = i.durationSec ? formatDuration(i.durationSec) : i.distanceM ? `${i.distanceM} m` : "";
    return [`${INTERVAL_TYPE_LABEL[i.type]}${(i.repeat ?? 1) > 1 ? ` ${i.repeat} ×` : ""} ${what}`.trim(), i.hrZone ? `Z${i.hrZone}` : null].filter(Boolean).join(" · ");
  });
}
