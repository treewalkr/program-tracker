import type { PrescribedSetDto, ProgramDto } from "./api/types";

/** Pure helpers for the inline program editor: set modes, grouped sets, dirty state, header copy. */

export type SetMode = "reps" | "timed" | "max";

export function setMode(s: PrescribedSetDto): SetMode {
  if (s.durationSeconds != null) return "timed";
  if (s.amrap) return "max";
  return "reps";
}

/** Convert one set to a mode, keeping load, RPE and rest. */
export function withMode(s: PrescribedSetDto, mode: SetMode): PrescribedSetDto {
  const base = { ...s, repsMin: undefined, durationSeconds: undefined, amrap: false };
  if (mode === "timed") return { ...base, reps: 0, durationSeconds: s.durationSeconds ?? 30 };
  if (mode === "max") return { ...base, amrap: true, reps: 0 };
  return { ...base, reps: s.reps > 0 ? s.reps : 8, repsMin: s.durationSeconds == null && !s.amrap ? s.repsMin : undefined };
}

const sig = ({ setNumber: _n, ...rest }: PrescribedSetDto) =>
  JSON.stringify(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null).sort());

/** True when every set is the same apart from its number, so one row can edit them all. */
export function isUniform(sets: PrescribedSetDto[]): boolean {
  return sets.length > 0 && sets.every((s) => sig(s) === sig(sets[0]));
}

const renumber = (sets: PrescribedSetDto[]) => sets.map((s, i) => ({ ...s, setNumber: i + 1 }));

/** Grow by copying the last set, or shrink from the end. Clamped to 1–20. */
export function withSetCount(sets: PrescribedSetDto[], n: number): PrescribedSetDto[] {
  const count = Math.min(20, Math.max(1, Math.round(n) || 1));
  const last = sets[sets.length - 1];
  const next = sets.slice(0, count);
  while (next.length < count) next.push({ ...last });
  return renumber(next);
}

/** Apply the same change to every set. */
export function patchAll(sets: PrescribedSetDto[], patch: (s: PrescribedSetDto) => PrescribedSetDto) {
  return renumber(sets.map(patch));
}

/** Parse a "7" or "7–8" / "7-8" rep or RPE range. */
export function parseRange(raw: string): { min: number | null; max: number } | null {
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : null;
  if (b == null || a === b) return { min: null, max: a };
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

export function repsLabel(s: PrescribedSetDto): string {
  return s.repsMin != null && s.repsMin !== s.reps ? `${s.repsMin}–${s.reps}` : `${s.reps}`;
}

/** Stable snapshot used to detect unsaved edits. */
export function snapshot(p: Pick<ProgramDto, "weeks" | "phasing">): string {
  return JSON.stringify({ weeks: p.weeks, phasing: p.phasing ?? null });
}

/** Sub-line under the title: version, origin, and save time — never contradicting the status pill. */
export function programSubline(p: ProgramDto, savedAt: string | null): string {
  const bits = [`v${p.version}`];
  if (p.aiAssisted) bits.push(p.createdFromProgramId ? "AI-assisted · built on the previous block" : "AI-assisted");
  if (savedAt) bits.push(`saved ${savedAt}`);
  return bits.join(" · ");
}
