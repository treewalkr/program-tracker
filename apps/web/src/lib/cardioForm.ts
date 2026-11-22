import { fmtPace, fmtSpeed } from "./units.svelte";
import {
  CARDIO_LOG_LIMITS as LIM,
  cardioPace,
  cardioTotals,
  SKIP_REASONS,
  sessionLoad,
  type CardioIntervalType,
  type CardioLog,
  type CardioMetric,
  type CardioPrescription,
  type SkipReason,
} from "@pt/shared";
import { formatDuration } from "$lib/ui/input/duration";

/**
 * The cardio log form, shared by the trainer's log page and the member portal:
 * the form state, prefill from a prescription or a saved log, the save payload,
 * and the calculated pace and load. Pure — the form component only renders it.
 */

/** One rep of one prescribed interval, as the member reports it. All optional. */
export interface IntervalResultRow {
  /** `${intervalId}:${rep}` */
  key: string;
  intervalId: string;
  rep: number;
  /** "Work 3 of 5", "Warm-up". */
  label: string;
  type: CardioIntervalType;
  durationSec: number | null;
  distanceKm: number | null;
  avgHr: number | null;
  rpe: number | null;
}

export interface CardioForm {
  modality: string;
  /** Required on a completed log. */
  durationSec: number | null;
  /** Session RPE 1–10; required on a completed log, never prefilled from the target. */
  rpe: number | null;
  distanceKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  pain: boolean;
  painNote: string;
  /** Set = the member didn't do it; everything else is ignored. */
  skipped: SkipReason | null;
  intervals: IntervalResultRow[];
}

export const INTERVAL_TYPE_LABEL: Record<CardioIntervalType, string> = {
  warmup: "Warm-up",
  work: "Work",
  active_recovery: "Active recovery",
  passive_recovery: "Passive recovery",
  cooldown: "Cool-down",
};

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  time: "No time",
  pain: "Pain or injury",
  equipment: "No equipment",
  other: "Something else",
};

export function emptyCardioForm(modality = ""): CardioForm {
  return {
    modality,
    durationSec: null,
    rpe: null,
    distanceKm: null,
    avgHr: null,
    maxHr: null,
    calories: null,
    pain: false,
    painNote: "",
    skipped: null,
    intervals: [],
  };
}

type Rx = Pick<CardioPrescription, "modality" | "durationMin" | "distanceKm" | "intervals"> | null | undefined;

/** A row per rep of every prescribed interval (recoveries between reps aren't reported). */
export function intervalRows(rx: Rx): IntervalResultRow[] {
  const rows: IntervalResultRow[] = [];
  for (const iv of rx?.intervals ?? []) {
    const reps = iv.repeat ?? 1;
    for (let rep = 1; rep <= reps; rep++) {
      const name = INTERVAL_TYPE_LABEL[iv.type];
      rows.push({
        key: `${iv.id}:${rep}`,
        intervalId: iv.id,
        rep,
        label: reps > 1 ? `${name} ${rep} of ${reps}` : name,
        type: iv.type,
        durationSec: null,
        distanceKm: null,
        avgHr: null,
        rpe: null,
      });
    }
  }
  return rows;
}

/**
 * A fresh form for a prescribed session: the modality, and the planned time and
 * distance as the starting point. Effort, heart rate and how it felt are the
 * member's to report, so the session RPE is never prefilled.
 */
export function cardioFormOf(rx: Rx): CardioForm {
  const totals = rx ? cardioTotals(rx) : null;
  return {
    ...emptyCardioForm(rx?.modality ?? ""),
    durationSec: totals?.durationSec ?? null,
    distanceKm: rx?.distanceKm ?? (totals && totals.distanceM > 0 ? totals.distanceM / 1000 : null),
    intervals: intervalRows(rx),
  };
}

/** "Did it as prescribed": the plan, with the target RPE as the session RPE. */
export function asPrescribedForm(rx: (Rx & { targetRpe?: number }) | null | undefined): CardioForm {
  return { ...cardioFormOf(rx), rpe: rx?.targetRpe ?? null };
}

/** A saved log back into the form (edit, undo); interval rows come from the plan, filled from the results. */
export function cardioFormOfLog(log: CardioLog, rx?: Rx): CardioForm {
  const sec = log.durationSec ?? (log.durationMin != null ? log.durationMin * 60 : null);
  const results = new Map((log.intervals ?? []).map((r) => [`${r.intervalId}:${r.rep}`, r]));
  return {
    modality: log.modality,
    durationSec: sec,
    rpe: log.rpe ?? null,
    distanceKm: log.distanceKm ?? null,
    avgHr: log.avgHr ?? null,
    maxHr: log.maxHr ?? null,
    calories: log.calories ?? null,
    pain: log.pain?.reported ?? false,
    painNote: log.pain?.note ?? "",
    skipped: log.skipped?.reason ?? null,
    intervals: intervalRows(rx).map((row) => {
      const r = results.get(row.key);
      return r
        ? { ...row, durationSec: r.durationSec ?? null, distanceKm: r.distanceM != null ? r.distanceM / 1000 : null, avgHr: r.avgHr ?? null, rpe: r.rpe ?? null }
        : row;
    }),
  };
}

export type CardioFormError =
  | "modality"
  | "duration"
  | "durationRange"
  | "rpe"
  | "maxHr"
  | "avgHrRange"
  | "maxHrRange"
  | "distanceRange"
  | "caloriesRange"
  | "intervalRange";

/** What each error asks for, in the trainer app's words. Range errors name the field and its limits. */
export const CARDIO_FORM_ERROR: Record<CardioFormError, string> = {
  modality: "Enter the modality — what did they do?",
  duration: "Enter how long it took (mm:ss).",
  durationRange: "Duration must be under 5 hours.",
  rpe: "Pick the session RPE — how hard the whole session felt.",
  maxHr: "Max HR can't be below the average.",
  avgHrRange: `Average HR must be ${LIM.hr.min}–${LIM.hr.max} bpm.`,
  maxHrRange: `Max HR must be ${LIM.hr.min}–${LIM.hr.max} bpm.`,
  distanceRange: `Distance must be ${LIM.distanceKm.max} km or less.`,
  caloriesRange: `Calories must be ${LIM.calories.min}–${LIM.calories.max.toLocaleString("en-US")}.`,
  intervalRange: `Check the per-interval results: RPE ${LIM.rpe.min}–${LIM.rpe.max}, heart rate ${LIM.hr.min}–${LIM.hr.max} bpm.`,
};

const outside = (v: number | null | undefined, r: { min: number; max: number }) => v != null && (v < r.min || v > r.max);

/** The first value outside what the API accepts, so the form can name it instead of a 422. */
export function cardioRangeError(form: CardioForm): CardioFormError | null {
  if (form.durationSec != null && form.durationSec > LIM.durationSec.max) return "durationRange";
  if (outside(form.avgHr, LIM.hr)) return "avgHrRange";
  if (outside(form.maxHr, LIM.hr)) return "maxHrRange";
  if (outside(form.distanceKm, LIM.distanceKm)) return "distanceRange";
  if (outside(form.calories, LIM.calories)) return "caloriesRange";
  const badRow = form.intervals.some(
    (r) =>
      outside(r.rpe, LIM.rpe) ||
      outside(r.avgHr, LIM.hr) ||
      outside(r.durationSec, LIM.durationSec) ||
      (r.distanceKm != null && (r.distanceKm < 0 || r.distanceKm > 100)),
  );
  return badRow ? "intervalRange" : null;
}

const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? undefined : v);

/**
 * The cardio log to save, or the first thing missing. A completed log always
 * carries `durationSec` and `rpe` (the API's write rule); a skipped one only
 * its modality and reason.
 */
export function cardioLogOf(form: CardioForm): { cardio: CardioLog } | { error: CardioFormError } {
  const modality = form.modality.trim();
  if (!modality) return { error: "modality" };
  if (form.skipped) return { cardio: { modality, skipped: { reason: form.skipped } } };
  if (form.durationSec == null || form.durationSec <= 0) return { error: "duration" };
  if (form.rpe == null) return { error: "rpe" };
  const range = cardioRangeError(form);
  if (range) return { error: range };
  if (form.avgHr != null && form.maxHr != null && form.maxHr < form.avgHr) return { error: "maxHr" };
  const intervals = form.intervals
    .filter((r) => r.durationSec != null || r.distanceKm != null || r.avgHr != null || r.rpe != null)
    .map((r) => ({
      intervalId: r.intervalId,
      rep: r.rep,
      ...(n(r.durationSec) != null ? { durationSec: Math.round(r.durationSec!) } : {}),
      ...(n(r.distanceKm) != null && r.distanceKm! > 0 ? { distanceM: Math.round(r.distanceKm! * 1000) } : {}),
      ...(n(r.avgHr) != null ? { avgHr: Math.round(r.avgHr!) } : {}),
      ...(n(r.rpe) != null ? { rpe: r.rpe! } : {}),
    }));
  const painNote = form.painNote.trim();
  const cardio: CardioLog = {
    modality,
    durationSec: Math.round(form.durationSec),
    // still written for a rollback (the previous build reads minutes)
    durationMin: Math.max(1, Math.round(form.durationSec / 60)),
    rpe: form.rpe,
    ...(n(form.distanceKm) != null && form.distanceKm! > 0 ? { distanceKm: form.distanceKm! } : {}),
    ...(n(form.avgHr) != null ? { avgHr: Math.round(form.avgHr!) } : {}),
    ...(n(form.maxHr) != null ? { maxHr: Math.round(form.maxHr!) } : {}),
    ...(n(form.calories) != null ? { calories: Math.round(form.calories!) } : {}),
    ...(form.pain ? { pain: { reported: true, ...(painNote ? { note: painNote } : {}) } } : {}),
    ...(intervals.length ? { intervals } : {}),
  };
  return { cardio };
}

const mmss = (sec: number) => formatDuration(sec);

/**
 * The calculated line under the form: pace (or split, or speed) when there's a
 * distance and a time, and the session load when there's a time and an RPE.
 */
export function cardioFormCalc(form: CardioForm, metric: CardioMetric): { pace: string | null; load: number | null } {
  if (form.skipped) return { pace: null, load: null };
  const log = { durationSec: form.durationSec ?? undefined, distanceKm: form.distanceKm ?? undefined, rpe: form.rpe ?? undefined };
  const p = cardioPace(log, metric);
  const pace =
    p?.metric === "pace" ? fmtPace(p.secPerKm) : p?.metric === "split" ? `${mmss(p.secPer500m)} /500 m` : p?.metric === "speed" ? fmtSpeed(p.kmh) : null;
  return { pace, load: sessionLoad(log) };
}

/** True when the form says anything the prefill didn't (worth a draft). */
export function cardioFormDirty(form: CardioForm, base: CardioForm): boolean {
  return JSON.stringify(form) !== JSON.stringify(base);
}

// ---------------------------------------------------------------------------
// Drafts: old shapes in localStorage read safely
// ---------------------------------------------------------------------------

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/**
 * A stored form, whatever build wrote it: the old minutes/zone strings become
 * seconds, unknown keys drop, junk becomes the empty form. Interval rows are
 * kept only when they match the session's (`base`), so an edited plan can't
 * leave stale reps behind.
 */
export function readCardioForm(raw: unknown, base: CardioForm = emptyCardioForm()): CardioForm {
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const minutes = num(r.durationMin);
  const saved = Array.isArray(r.intervals) ? (r.intervals as Partial<IntervalResultRow>[]) : [];
  const byKey = new Map(saved.filter((x) => x && typeof x.key === "string").map((x) => [x.key!, x]));
  return {
    modality: typeof r.modality === "string" ? r.modality : base.modality,
    durationSec: num(r.durationSec) ?? (minutes != null ? minutes * 60 : base.durationSec),
    rpe: num(r.rpe),
    distanceKm: num(r.distanceKm),
    avgHr: num(r.avgHr),
    maxHr: num(r.maxHr),
    calories: num(r.calories),
    pain: r.pain === true,
    painNote: typeof r.painNote === "string" ? r.painNote : "",
    skipped: (SKIP_REASONS as readonly string[]).includes(r.skipped as string) ? (r.skipped as SkipReason) : null,
    intervals: base.intervals.map((row) => {
      const x = byKey.get(row.key);
      return x ? { ...row, durationSec: num(x.durationSec), distanceKm: num(x.distanceKm), avgHr: num(x.avgHr), rpe: num(x.rpe) } : row;
    }),
  };
}
