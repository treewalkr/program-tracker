import { resolveLoadKg } from "@pt/shared";
import type { ProgramWeekDto, WeekPlan } from "./api/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "20 Sep 2026" — fixed 3-letter months, day-first, locale-independent. */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * "Sat 7 Nov 2026, 14:39:42 GMT+7" — the full local stamp for tooltips.
 * Hand-built like `fmtDate` so it reads the same in every locale.
 */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const off = -d.getTimezoneOffset();
  const abs = Math.abs(off);
  const zone =
    off === 0 ? "GMT" : `GMT${off > 0 ? "+" : "-"}${Math.floor(abs / 60)}${abs % 60 ? `:${pad2(abs % 60)}` : ""}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return `${WEEKDAYS[d.getDay()]} ${fmtDate(iso)}, ${time} ${zone}`;
}

/** Compact duration: 45 → "45s", 60 → "1:00", 90 → "1:30". */
export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** One prescribed set as a coach reads it: "65kg × 6–10", "105kg (75%) × 5",
 *  "90kg × AMRAP, stop @ RPE 9", "45s", "10/8/6/5" handled per-set. */
export interface SetLabelInput {
  reps: number;
  repsMin?: number;
  amrap: boolean;
  durationSeconds?: number;
  targetWeightKg?: number | null;
  percent1rm?: number | null;
  targetRpe?: number | null;
  stopRpe?: number | null;
}
/** The load part: resolved kg (with its %1RM), a bare % when the 1RM is unknown, or the kg target. */
function loadLabel(s: SetLabelInput, oneRepMaxKg: number | null | undefined): string {
  const kg = resolveLoadKg(s, oneRepMaxKg);
  if (s.percent1rm != null && oneRepMaxKg != null && kg != null) return `${kg}kg (${s.percent1rm}%) × `;
  if (kg != null) return `${kg}kg × `;
  if (s.percent1rm != null) return `${s.percent1rm}% × `;
  return "";
}
/** AMRAP stop RPE; an older AMRAP's target RPE reads as its stop. */
export const amrapStop = (s: { amrap?: boolean; stopRpe?: number | null; targetRpe?: number | null }) =>
  s.amrap ? (s.stopRpe ?? s.targetRpe ?? null) : null;

export function fmtSet(s: SetLabelInput, oneRepMaxKg?: number | null): string {
  const load = loadLabel(s, oneRepMaxKg);
  if (s.durationSeconds != null) return `${load}${fmtDuration(s.durationSeconds)}`;
  if (s.amrap) {
    const stop = amrapStop(s);
    return `${load}${s.reps > 0 ? `${s.reps}+ ` : ""}AMRAP${stop != null ? `, stop @ RPE ${stop}` : ""}`;
  }
  const reps = s.repsMin != null && s.repsMin !== s.reps ? `${s.repsMin}–${s.reps}` : `${s.reps}`;
  return `${load}${reps}`;
}

/** Target RPE as "8" or "7–8"; null for AMRAP sets (their RPE is the stop, see fmtSet). */
export function rpeLabel(s: { targetRpe?: number | null; targetRpeMin?: number | null; amrap?: boolean }): string | null {
  if (s.amrap || s.targetRpe == null) return null;
  return s.targetRpeMin != null && s.targetRpeMin < s.targetRpe ? `${s.targetRpeMin}–${s.targetRpe}` : `${s.targetRpe}`;
}

export function weekPlanLabel(w: WeekPlan): string {
  let label = `W${w.week} · ${w.directive}`;
  if (w.target) {
    const short =
      w.target.metric === "overall_volume"
        ? "overall vol"
        : w.target.metric === "rep_volume"
        ? "rep vol"
        : "intensity";
    const sign = w.target.deltaPercent >= 0 ? "+" : "";
    label += ` · ${short} ${sign}${w.target.deltaPercent}%`;
  }
  return label;
}

/** Week-switcher model for the client Program tab: one entry per program week,
 *  in order; `isCurrent` marks the default selection (pulseWeek clamped to range). */
export function weekOptions(
  weeks: ProgramWeekDto[],
  currentWeek: number
): { week: number; label: string; isCurrent: boolean }[] {
  const clamped = Math.max(1, Math.min(currentWeek, weeks.length));
  return weeks.map((w) => ({
    week: w.week,
    label: `W${w.week}`,
    isCurrent: w.week === clamped,
  }));
}
