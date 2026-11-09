import { z } from "zod";
import type { PrescribedSet, ProgramExercise, ProgramWeek } from "./domain";

/**
 * The deload rule. Deloads mainly cut volume and hold or slightly reduce
 * intensity, with no failure sets (Pritchard 2015; Bell 2023 consensus).
 * Each trainer can tune it (Settings), and each client can override it; the
 * program-page button, the deload-week signal, the AI prompts and the default
 * plan's deload target all read the effective rule (`effectiveDeload`).
 */
export const DeloadSettings = z
  .object({
    /** Share of each exercise's sets kept, rounded up, at least 1. */
    setsKeptPercent: z.number().min(25).max(100).multipleOf(5),
    /** Load change, −50 … 0 %. */
    loadPercent: z.number().min(-50).max(0).multipleOf(2.5),
    /** What the load change applies to: last week's load, or the block's week-1 load. */
    loadBasis: z.enum(["previous", "week1"]),
    /** Top RPE for every kept set; null = no cap. */
    rpeCap: z.number().min(4).max(10).multipleOf(0.5).nullable(),
    /** true keeps AMRAP sets as AMRAP. */
    amrap: z.boolean(),
  })
  .strict();
export type DeloadSettings = z.infer<typeof DeloadSettings>;
export type DeloadLoadBasis = DeloadSettings["loadBasis"];

export const DEFAULT_DELOAD: DeloadSettings = Object.freeze({
  setsKeptPercent: 50,
  loadPercent: -10,
  loadBasis: "previous",
  rpeCap: 6,
  amrap: false,
}) as DeloadSettings;

/** The rule in force: the client's override, else the trainer's, else the default. Invalid values are skipped. */
export function effectiveDeload(trainerSettings: unknown, clientSettings?: unknown): DeloadSettings {
  for (const s of [clientSettings, trainerSettings]) {
    if (s == null) continue;
    const parsed = DeloadSettings.safeParse(s);
    if (parsed.success) return parsed.data;
  }
  return { ...DEFAULT_DELOAD };
}

/** Multiplier on load, e.g. −10 % → 0.9. */
export const deloadLoadFactor = (s: DeloadSettings = DEFAULT_DELOAD): number => 1 + s.loadPercent / 100;

export const DELOAD_LOAD_FACTOR = deloadLoadFactor(DEFAULT_DELOAD);
export const DELOAD_RPE_CAP = DEFAULT_DELOAD.rpeCap as number;

/** "7.5" not "7.50"; minus sign, not hyphen. */
const num = (n: number) => String(Math.abs(n)).replace(/\.0+$/, "");

/** Plain-language rules — reuse wherever a deload is described. */
export function deloadRulesText(s: DeloadSettings = DEFAULT_DELOAD): string {
  const sets =
    s.setsKeptPercent >= 100
      ? "all sets kept"
      : s.setsKeptPercent === 50
        ? "half the sets per exercise (rounded up)"
        : `${s.setsKeptPercent} % of the sets per exercise (rounded up)`;
  const from = s.loadBasis === "week1" ? "week 1" : "last week";
  const loads = s.loadPercent === 0 ? `loads as ${from}` : `loads −${num(s.loadPercent)} % from ${from}`;
  const rpe = s.rpeCap == null ? "no RPE cap" : `RPE ${num(s.rpeCap)} cap`;
  const amrap = s.amrap ? "AMRAP sets kept" : "no AMRAP sets";
  return `${sets}, ${loads}, ${rpe}, ${amrap}`;
}

/** The default rule in plain language. */
export const DELOAD_RULES = deloadRulesText(DEFAULT_DELOAD);

/** Volume vs the previous week, as a percent: sets kept × load factor − 1 (default: half the sets at 90 % ≈ −55 %). */
export function deloadVolumeDeltaPercent(s: DeloadSettings = DEFAULT_DELOAD): number {
  return Math.round(((s.setsKeptPercent / 100) * deloadLoadFactor(s) - 1) * 100);
}

export const DELOAD_VOLUME_DELTA_PERCENT = deloadVolumeDeltaPercent(DEFAULT_DELOAD);

/** The load change on the 2.5 kg grid (0.5 kg below 20 kg); never above the base load. */
export function deloadLoad(kg: number, s: DeloadSettings = DEFAULT_DELOAD): number {
  const step = kg >= 20 ? 2.5 : 0.5;
  const cut = Math.round((kg * deloadLoadFactor(s)) / step) * step;
  return Math.max(0, Math.min(cut, kg));
}

/** Sets kept per exercise: rounded up, at least 1. */
export const deloadSetCount = (n: number, s: DeloadSettings = DEFAULT_DELOAD): number =>
  Math.max(1, Math.min(n, Math.ceil((n * s.setsKeptPercent) / 100 - 1e-9)));

/**
 * Each lifting exercise's place in the week, stable across weeks: the n-th
 * occurrence of an exercise in session `seq` (a top set and back-offs of the
 * same lift stay apart). Same key as the web log sheet's slot ids.
 */
function weekSlots(week: ProgramWeek): Map<string, ProgramExercise> {
  const out = new Map<string, ProgramExercise>();
  for (const s of week.sessions) {
    if (s.kind !== "lifting") continue;
    const seen = new Map<string, number>();
    for (const e of [...s.exercises].sort((a, b) => a.order - b.order)) {
      const n = (seen.get(e.exerciseId) ?? 0) + 1;
      seen.set(e.exerciseId, n);
      out.set(`${s.kind}:${s.seq}:${e.exerciseId}:${n}`, e);
    }
  }
  return out;
}

function deloadExercise(e: ProgramExercise, s: DeloadSettings, base: ProgramExercise | undefined): ProgramExercise {
  const keep = e.prescribedSets.slice(0, deloadSetCount(e.prescribedSets.length, s));
  // A 0-rep failure set needs a rep target once AMRAP is off: borrow the exercise's.
  const fallbackReps = Math.max(0, ...e.prescribedSets.filter((x) => !x.amrap).map((x) => x.reps)) || 8;
  return {
    ...e,
    prescribedSets: keep.map((set, i): PrescribedSet => {
      const next: PrescribedSet = { ...set, setNumber: i + 1 };
      if (!s.amrap) {
        next.amrap = false;
        delete next.stopRpe;
        if (set.amrap && set.reps === 0 && set.durationSeconds === undefined) {
          next.reps = fallbackReps;
          if (next.repsMin !== undefined && next.repsMin > next.reps) delete next.repsMin;
        }
      }
      if (s.rpeCap != null) {
        next.targetRpe = Math.min(set.targetRpe ?? s.rpeCap, s.rpeCap);
        if (next.targetRpeMin !== undefined && next.targetRpeMin > next.targetRpe) delete next.targetRpeMin;
        if (next.stopRpe !== undefined) next.stopRpe = Math.min(next.stopRpe, s.rpeCap);
      }
      // Week-1 basis: the same slot's same set in week 1; without one, last week's load.
      const baseKg = base?.prescribedSets[i]?.targetWeightKg;
      if (baseKg != null) next.targetWeightKg = deloadLoad(baseKg, s);
      else if (set.targetWeightKg != null) next.targetWeightKg = deloadLoad(set.targetWeightKg, s);
      return next;
    }),
  };
}

/**
 * A deloaded copy of `week` by the rule `settings`: lifting sessions only;
 * cardio is left as planned. With the week-1 basis, pass the block's `week1`.
 */
export function deloadWeek(week: ProgramWeek, settings: DeloadSettings = DEFAULT_DELOAD, week1?: ProgramWeek): ProgramWeek {
  const copy = structuredClone(week);
  const baseSlots = settings.loadBasis === "week1" && week1 ? weekSlots(week1) : null;
  const slotOf = new Map<ProgramExercise, string>();
  if (baseSlots) for (const [k, e] of weekSlots(copy)) slotOf.set(e, k);
  return {
    ...copy,
    sessions: copy.sessions.map((s) =>
      s.kind === "lifting"
        ? {
            ...s,
            exercises: s.exercises.map((e) => {
              const slot = slotOf.get(e);
              return deloadExercise(e, settings, slot ? baseSlots?.get(slot) : undefined);
            }),
          }
        : s
    ),
  };
}
