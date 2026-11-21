import { cardioTotals, recoveryCount, type CardioIntervalType, type PortalCardioInterval, type PortalCardioPrescription, type PortalLastSet, type PortalSet } from "@pt/shared";
import { formatDuration } from "$lib/ui/input/duration";
import { showDistance, showPace, showWeight, units } from "$lib/units.svelte";
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

/** Stored kg in the member's unit: "60 kg", "132.3 lb" (several: "50 / 55 / 60 kg"). */
export function weightText(kgs: number | number[], t: T): string {
  const list = (Array.isArray(kgs) ? kgs : [kgs]).map((kg) => num(units.weight === "lb" ? showWeight(kg, "lb") : kg)).join(" / ");
  return units.weight === "lb" ? t("rx.lb", { n: list }) : t("rx.kg", { n: list });
}

/** Stored km in the member's unit: "5.2 km", "3.23 mi". */
export function distanceText(km: number, t: T): string {
  return units.distance === "mi" ? t("rx.mi", { n: num2(showDistance(km, "mi")) }) : t("rx.km", { n: num2(km) });
}

const num2 = (n: number) => String(Math.round(n * 100) / 100);

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
  if (distinctKg.length === 1) parts.push(weightText(distinctKg[0], t));
  else if (distinctKg.length > 1) parts.push(weightText(kgs, t));

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

/** A time as the client reads it: "2 min", "45 s", "1:30 min". */
export function durationText(sec: number, t: T): string {
  if (sec < 60) return t("rx.seconds", { n: sec });
  return t("rx.minutes", { n: sec % 60 === 0 ? sec / 60 : formatDuration(sec) });
}

/** A distance in metres: "400 m" under a kilometre (track reps stay in metres), else "1.6 km" / "0.99 mi". */
export function metresText(m: number, t: T): string {
  return m < 1000 ? t("rx.metres", { n: m }) : distanceText(m / 1000, t);
}

const paceText = (secPerKm: number, t: T) =>
  units.distance === "mi" ? t("rx.paceMi", { t: formatDuration(showPace(secPerKm, "mi")) }) : t("rx.pace", { t: formatDuration(secPerKm) });
const bpmText = (b: { min: number; max: number }) => `${b.min}–${b.max} bpm`;

/** A cardio prescription's parts: "40 min · zone 2 · 123–148 bpm · 5 km · RPE 4 · easy". */
export function cardioParts(c: Pick<PortalCardioPrescription, "durationMin" | "hrZone" | "distanceKm" | "targetRpe" | "intensity" | "hrBpm" | "paceSecPerKm" | "intervals">, t: T): string[] {
  const parts: string[] = [];
  // a session built from intervals shows its total time, as the coach's editor adds it up
  const total = c.intervals?.length ? cardioTotals({ intervals: c.intervals.map((iv) => ({ ...iv })) }) : null;
  if (total) {
    if (total.durationSec) parts.push(durationText(total.durationSec, t));
    if (total.distanceM > 0) parts.push(metresText(total.distanceM, t));
  } else {
    if (c.durationMin) parts.push(t("rx.minutes", { n: c.durationMin }));
    if (c.hrZone) parts.push(t("rx.zone", { n: c.hrZone }));
    if (c.hrBpm) parts.push(bpmText(c.hrBpm));
    if (c.distanceKm) parts.push(distanceText(c.distanceKm, t));
    if (c.paceSecPerKm) parts.push(paceText(c.paceSecPerKm, t));
  }
  if (c.targetRpe) parts.push(t("rx.rpe", { n: num(c.targetRpe) }));
  if (c.intensity) parts.push(c.intensity);
  return parts;
}

/** One line of the session's intervals, in order, as the client reads it. */
export interface IntervalLine {
  key: string;
  kind: "easy" | "work" | "recovery";
  name: string;
  /** "10 min", "2 min × 5", "400 m × 6". */
  amount: string;
  zone: string | null;
  bpm: string | null;
  /** RPE, pace, or "between hard reps". */
  extra: string | null;
  notes: string | null;
}

const kindOf = (type: CardioIntervalType): IntervalLine["kind"] =>
  type === "work" ? "work" : type === "active_recovery" || type === "passive_recovery" ? "recovery" : "easy";

function amountOf(p: { durationSec?: number; distanceM?: number }, times: number, t: T): string {
  const base = p.durationSec ? durationText(p.durationSec, t) : p.distanceM ? metresText(p.distanceM, t) : "";
  return times > 1 && base ? `${base} × ${times}` : base;
}

/** The intervals line by line: each block, then its recovery between reps. */
export function intervalLines(intervals: readonly PortalCardioInterval[], t: T): IntervalLine[] {
  const out: IntervalLine[] = [];
  for (const iv of intervals) {
    const reps = iv.repeat ?? 1;
    const extra = [iv.rpe != null ? t("rx.rpe", { n: num(iv.rpe) }) : null, iv.paceSecPerKm ? paceText(iv.paceSecPerKm, t) : null].filter(Boolean).join(" · ");
    out.push({
      key: iv.id,
      kind: kindOf(iv.type),
      name: t(`iv.${iv.type}`),
      amount: amountOf(iv, reps, t),
      zone: iv.hrZone ? t("iv.zone", { n: iv.hrZone }) : null,
      bpm: iv.hrBpm ? bpmText(iv.hrBpm) : null,
      extra: extra || null,
      notes: iv.notes ?? null,
    });
    const recs = recoveryCount(iv);
    if (iv.recovery && recs > 0) {
      out.push({
        key: `${iv.id}:rec`,
        kind: "recovery",
        name: t(`iv.${iv.recovery.type}`),
        amount: amountOf(iv.recovery, recs, t),
        zone: null,
        bpm: null,
        extra: iv.recoveryAfterLast ? t("iv.afterEach") : t("iv.between"),
        notes: null,
      });
    }
  }
  return out;
}

/** "62.5 kg × 8 · RPE 8" — what the client did last time; RPE only when they gave it. */
export function lastSetText(s: PortalLastSet, t: T): string {
  const work = s.weightKg != null && s.weightKg > 0 ? t("rx.lastReps", { kg: weightText(s.weightKg, t), reps: s.reps }) : t("rx.reps", { n: s.reps });
  return s.rpe != null ? `${work} · ${t("rx.rpe", { n: num(s.rpe) })}` : work;
}
