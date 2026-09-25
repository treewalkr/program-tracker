const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "20 Sep 2026" — fixed 3-letter months, day-first, locale-independent. */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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
