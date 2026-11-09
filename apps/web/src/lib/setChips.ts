import type { PrescribedSetDto } from "./api/types";
import { fmtSet, rpeLabel } from "./format";

/** One set-chip: a run of `count` sets that read the same. */
export interface SetGroup {
  count: number;
  main: string;
  rir: number | null;
  tempo: string | null;
  /** "8", "7–8" (range), "7→8" (ramp across the run), "7/9/8"; null when unset. */
  rpe: string | null;
  rest: string | null;
  /** Highest single RPE in the run (0 for AMRAP / unset) — drives the effort tier. */
  maxRpe: number;
}

interface Labelled {
  main: string;
  rir: number | null;
  tempo: string | null;
  rpe: string | null;
  top: number;
  ranged: boolean;
  rest: string | null;
}

const label = (s: PrescribedSetDto, oneRepMaxKg: number | null): Labelled => ({
  main: fmtSet(s, oneRepMaxKg),
  // One effort scale per chip: RIR only when the set has no RPE.
  rir: rpeLabel(s) == null ? (s.targetRir ?? null) : null,
  tempo: s.tempo ? s.tempo.toUpperCase() : null,
  rpe: rpeLabel(s),
  top: s.amrap ? 0 : (s.targetRpe ?? 0),
  ranged: s.targetRpeMin != null,
  rest: s.restSeconds ? `${s.restSeconds}s` : null,
});

/** Same chip apart from effort: reps/load, RIR, tempo, rest. */
const shapeKey = (l: Labelled) => [l.main, l.rir, l.tempo, l.rest].join("|");

/** RPE label for a run whose shape matches: one value, a ramp (7→8), or a list. */
function runRpe(run: Labelled[]): string | null {
  const rpes = run.map((l) => l.rpe);
  if (!rpes.every((r) => r != null)) return new Set(rpes).size === 1 ? rpes[0] : null;
  if (new Set(rpes).size === 1) return rpes[0];
  if (run.some((l) => l.ranged)) return rpes.join("/");
  // A ramp reads as a progression (7→8), never a range (7–8 means "either").
  const vals = run.map((l) => l.top);
  const up = vals.every((v, i) => i === 0 || v >= vals[i - 1]);
  const down = vals.every((v, i) => i === 0 || v <= vals[i - 1]);
  return up || down ? `${vals[0]}→${vals[vals.length - 1]}` : vals.join("/");
}

const toGroup = (run: Labelled[], rpe: string | null): SetGroup => ({
  count: run.length,
  main: run[0].main,
  rir: run[0].rir,
  tempo: run[0].tempo,
  rpe,
  rest: run[0].rest,
  maxRpe: Math.max(...run.map((l) => l.top)),
});

/**
 * Coach notation for a prescription. Every set the same shape → one chip
 * (`3×8–10 @RPE 7→8 · 90s`). Otherwise consecutive identical sets become runs,
 * so a top set and its back-offs read `1×3 @RPE 8` then `3×5 @RPE 7` instead
 * of one chip per set.
 */
export function groupSets(sets: readonly PrescribedSetDto[], oneRepMaxKg: number | null = null): SetGroup[] {
  if (sets.length === 0) return [];
  const labelled = sets.map((s) => label(s, oneRepMaxKg));
  if (new Set(labelled.map(shapeKey)).size === 1) return [toGroup(labelled, runRpe(labelled))];
  const runs: Labelled[][] = [];
  for (const l of labelled) {
    const last = runs[runs.length - 1];
    if (last && shapeKey(last[0]) === shapeKey(l) && last[0].rpe === l.rpe) last.push(l);
    else runs.push([l]);
  }
  return runs.map((run) => toGroup(run, run[0].rpe));
}

/** Plain-words effort: "RPE 8", "RPE 7 to 8", "RPE rising 7 to 8", "RPE 7, 9, 8". */
export function rpeWords(rpe: string): string {
  const ramp = rpe.match(/^(\d+(?:\.\d+)?)→(\d+(?:\.\d+)?)$/);
  if (ramp) return `RPE ${Number(ramp[2]) >= Number(ramp[1]) ? "rising" : "falling"} ${ramp[1]} to ${ramp[2]}`;
  if (rpe.includes("–")) return `RPE ${rpe.replace("–", " to ")}`;
  if (rpe.includes("/")) return `RPE ${rpe.split("/").map((v) => v.replace("–", " to ")).join(", ")}`;
  return `RPE ${rpe}`;
}

/** Plain-words rest: "rest 90 sec", "rest 2 min", "rest 2 min 30 sec". */
export function restWords(rest: string): string {
  const s = Number.parseInt(rest, 10);
  if (!Number.isFinite(s)) return `rest ${rest}`;
  if (s < 60) return `rest ${s} sec`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (r === 0) return `rest ${m} min`;
  return m === 1 && r === 30 ? "rest 90 sec" : `rest ${m} min ${r} sec`;
}

/** Plain-words form of a chip (tap-to-words, title). */
export function describeGroup(g: SetGroup): string {
  const setsWord = g.count === 1 ? "1 set" : `${g.count} sets`;
  const main = /^[\d–]+$/.test(g.main) ? `${g.main.replace("–", " to ")} reps` : g.main;
  const parts = [`${setsWord} × ${main}`];
  if (g.rpe) parts.push(rpeWords(g.rpe));
  else if (g.rir != null) parts.push(`${g.rir} in reserve`);
  if (g.tempo) parts.push(`tempo ${g.tempo}`);
  if (g.rest) parts.push(restWords(g.rest));
  return parts.join(" · ");
}

/** Read-aloud form: tempo digits apart ("tempo 3 1 1 0"), not "3 minus 1". */
export const spokenGroup = (g: SetGroup) => describeGroup(g).replace(/([0-9X])-(?=[0-9X])/gi, "$1 ");
