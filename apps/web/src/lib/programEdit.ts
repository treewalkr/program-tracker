import { TEMPO_PATTERN } from "@pt/shared";
import type { PrescribedSetDto, ProgramDto } from "./api/types";

/** Pure helpers for the inline program editor: set modes, grouped sets, dirty state, header copy. */

export type SetMode = "reps" | "timed" | "max";

export function setMode(s: PrescribedSetDto): SetMode {
  if (s.durationSeconds != null) return "timed";
  if (s.amrap) return "max";
  return "reps";
}

/** Convert one set to a mode, keeping load, RPE and rest. An AMRAP's RPE is its stop RPE. */
export function withMode(s: PrescribedSetDto, mode: SetMode): PrescribedSetDto {
  const rpe = s.amrap ? (s.stopRpe ?? s.targetRpe) : s.targetRpe;
  const base = { ...s, repsMin: undefined, durationSeconds: undefined, amrap: false, stopRpe: undefined, targetRpe: rpe };
  if (mode === "timed") return { ...base, reps: 0, durationSeconds: s.durationSeconds ?? 30 };
  if (mode === "max") return { ...base, amrap: true, reps: 0, stopRpe: rpe, targetRpe: undefined, targetRpeMin: undefined };
  return { ...base, reps: s.reps > 0 ? s.reps : 8, repsMin: s.durationSeconds == null && !s.amrap ? s.repsMin : undefined };
}

/** Load cell text: "75%" for a %1RM set, else the kg. */
export function loadCell(s: PrescribedSetDto): string {
  if (s.percent1rm != null) return `${s.percent1rm}%`;
  return s.targetWeightKg != null ? `${s.targetWeightKg}` : "";
}

/** Load cell input: "102.5" sets kg, "75%" sets %1RM (each clears the other), blank clears both; junk is ignored. */
export function withLoad(s: PrescribedSetDto, raw: string): PrescribedSetDto {
  const t = raw.trim();
  if (t === "") return { ...s, targetWeightKg: null, percent1rm: undefined };
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(%)?$/);
  if (!m) return s;
  const v = Number(m[1].replace(",", "."));
  if (m[2]) return v >= 1 && v <= 110 ? { ...s, percent1rm: v, targetWeightKg: undefined } : s;
  return v <= 600 ? { ...s, targetWeightKg: v, percent1rm: undefined } : s;
}

/** RPE cell text: "8" or "7–8"; in Max mode the stop RPE. */
export function rpeCell(s: PrescribedSetDto, mode: SetMode): string {
  if (mode === "max") return s.stopRpe != null ? `${s.stopRpe}` : "";
  if (s.targetRpe == null) return "";
  return s.targetRpeMin != null && s.targetRpeMin < s.targetRpe ? `${s.targetRpeMin}–${s.targetRpe}` : `${s.targetRpe}`;
}

const rpeOk = (v: number) => v >= 1 && v <= 10;

/** RPE cell input: "8" or "7–8" (range); in Max mode the stop RPE. Blank clears; junk is ignored. */
export function withRpe(s: PrescribedSetDto, raw: string, mode: SetMode): PrescribedSetDto {
  if (raw.trim() === "") return mode === "max" ? { ...s, stopRpe: undefined } : { ...s, targetRpe: undefined, targetRpeMin: undefined };
  const r = parseRange(raw);
  if (!r || !rpeOk(r.max) || (r.min != null && !rpeOk(r.min))) return s;
  if (mode === "max") return { ...s, stopRpe: r.max, targetRpe: undefined, targetRpeMin: undefined };
  return { ...s, targetRpe: r.max, targetRpeMin: r.min ?? undefined };
}

/** Tempo input: four phases ("3-1-1-0" / "31X0"), X uppercased; blank clears; invalid input is ignored. */
export function withTempo(s: PrescribedSetDto, raw: string): PrescribedSetDto {
  const t = raw.trim().toUpperCase();
  if (t === "") return { ...s, tempo: undefined };
  return TEMPO_PATTERN.test(t) ? { ...s, tempo: t } : s;
}

/** RIR input, clamped to 0–10; blank clears. */
export function withRir(s: PrescribedSetDto, raw: string): PrescribedSetDto {
  if (raw.trim() === "") return { ...s, targetRir: undefined };
  const v = Number(raw);
  return Number.isFinite(v) ? { ...s, targetRir: Math.min(10, Math.max(0, Math.round(v * 2) / 2)) } : s;
}

const sig = ({ setNumber: _n, ...rest }: PrescribedSetDto) =>
  JSON.stringify(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null).sort());

/** True when every set is the same apart from its number, so one row can edit them all. */
export function isUniform(sets: PrescribedSetDto[]): boolean {
  return sets.length > 0 && sets.every((s) => sig(s) === sig(sets[0]));
}

const renumber = (sets: PrescribedSetDto[]) => sets.map((s, i) => ({ ...s, setNumber: i + 1 }));

/** Grow by copying the last set, or shrink from the end. Clamped to 1–20. */
export { withSetCount } from "@pt/shared";

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

/** Stable snapshot used to detect unsaved edits. Keys are sorted: Postgres jsonb
 *  reorders them, so a saved program read back must still match the editor's copy. */
export function snapshot(p: Pick<ProgramDto, "weeks" | "phasing">): string {
  return JSON.stringify({ weeks: p.weeks, phasing: p.phasing ?? null }, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]]))
      : value
  );
}

/** Sub-line under the title: version, origin, and save time — never contradicting the status pill. */
export function programSubline(p: ProgramDto, savedAt: string | null): string {
  const bits = [`v${p.version}`];
  if (p.aiAssisted) bits.push(p.createdFromProgramId ? "AI-assisted · built on the previous block" : "AI-assisted");
  if (savedAt) bits.push(`saved ${savedAt}`);
  return bits.join(" · ");
}
