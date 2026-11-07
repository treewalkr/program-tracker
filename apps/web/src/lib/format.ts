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

/** One prescribed set as a coach reads it: "65kg × 6–10", "failure", "45s", "10/8/6/5" handled per-set. */
export interface SetLabelInput {
  reps: number;
  repsMin?: number;
  amrap: boolean;
  durationSeconds?: number;
  targetWeightKg?: number | null;
}
export function fmtSet(s: SetLabelInput): string {
  const load = s.targetWeightKg != null ? `${s.targetWeightKg}kg × ` : "";
  if (s.durationSeconds != null) return `${load}${fmtDuration(s.durationSeconds)}`;
  if (s.amrap && s.reps === 0) return `${load}failure`;
  const reps =
    s.repsMin != null && s.repsMin !== s.reps ? `${s.repsMin}–${s.reps}` : `${s.reps}${s.amrap ? "+" : ""}`;
  return `${load}${reps}`;
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
