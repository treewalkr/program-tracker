import type { CardioPrescription, PortalSet } from "@pt/shared";
import type { MessageKey } from "./messages";

/**
 * A prescription as a client reads it, in their language: "4 × 8–12 · 60 kg ·
 * RPE 8 · rest 2 min". Pure — the caller passes the portal's `t`.
 */
type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

/** One set's target, without the set count: "6 reps", "8–12 reps", "45 s". */
export function setTarget(s: PortalSet, t: T): string {
  if (s.durationSeconds != null) return t("rx.seconds", { n: s.durationSeconds });
  if (s.amrap) return s.reps > 0 ? t("rx.amrapMin", { n: s.reps }) : t("rx.amrap");
  if (s.repsMin != null && s.repsMin < s.reps) return t("rx.repsRange", { min: s.repsMin, max: s.reps });
  return t("rx.reps", { n: s.reps });
}

/** Bare target for "4 × 8" — rep counts lose their unit. */
function bareTarget(s: PortalSet, t: T): string {
  if (s.durationSeconds != null || s.amrap) return setTarget(s, t);
  return s.repsMin != null && s.repsMin < s.reps ? `${s.repsMin}–${s.reps}` : String(s.reps);
}

const uniq = <V>(vs: V[]) => [...new Set(vs)];

/** Rest as "2 min" / "90 s". */
export function restText(seconds: number, t: T): string {
  if (seconds >= 60 && seconds % 30 === 0) return t("rx.minutes", { n: num(seconds / 60) });
  return t("rx.seconds", { n: seconds });
}

/** The parts of an exercise's prescription, each a short chip. */
export function setParts(sets: PortalSet[], t: T): string[] {
  if (sets.length === 0) return [];
  const parts: string[] = [];
  const targets = uniq(sets.map((s) => bareTarget(s, t)));
  parts.push(targets.length === 1 ? t("rx.sets", { n: sets.length, reps: targets[0] }) : sets.map((s) => bareTarget(s, t)).join(" / "));

  const kgs = sets.map((s) => s.targetWeightKg).filter((k): k is number => k != null && k > 0);
  const distinctKg = uniq(kgs);
  if (distinctKg.length === 1) parts.push(t("rx.kg", { n: num(distinctKg[0]) }));
  else if (distinctKg.length > 1) parts.push(t("rx.kg", { n: kgs.map(num).join(" / ") }));

  const efforts = sets.map((s) => (s.targetRpe == null ? null : s.targetRpeMin != null ? `${num(s.targetRpeMin)}–${num(s.targetRpe)}` : num(s.targetRpe)));
  const distinctEffort = uniq(efforts.filter((e): e is string => e != null));
  if (distinctEffort.length === 1) parts.push(t("rx.rpe", { n: distinctEffort[0] }));
  else if (distinctEffort.length > 1) parts.push(t("rx.rpe", { n: `${distinctEffort[0]}→${distinctEffort[distinctEffort.length - 1]}` }));
  else {
    const rir = uniq(sets.map((s) => s.targetRir).filter((r): r is number => r != null));
    if (rir.length === 1) parts.push(t("rx.rir", { n: num(rir[0]) }));
  }

  const tempo = sets.find((s) => s.tempo)?.tempo;
  if (tempo) parts.push(t("rx.tempo", { t: tempo }));
  const rest = sets.find((s) => s.restSeconds != null && s.restSeconds > 0)?.restSeconds;
  if (rest) parts.push(t("rx.rest", { t: restText(rest, t) }));
  return parts;
}

/** A cardio prescription's parts: "40 min · zone 2 · 5 km · easy". */
export function cardioParts(c: CardioPrescription, t: T): string[] {
  const parts: string[] = [];
  if (c.durationMin) parts.push(t("rx.minutes", { n: c.durationMin }));
  if (c.hrZone) parts.push(t("rx.zone", { n: c.hrZone }));
  if (c.distanceKm) parts.push(t("rx.km", { n: num(c.distanceKm) }));
  if (c.targetRpe) parts.push(t("rx.rpe", { n: num(c.targetRpe) }));
  if (c.intensity) parts.push(c.intensity);
  return parts;
}
