import {
  KM_PER_MI,
  MODALITY_PRESETS,
  formatPace,
  formatSpeed,
  kmToMi,
  modalityMetric,
  recoveryCount,
  zoneBpm,
  type CardioInterval,
  type CardioIntervalType,
  type CardioMetric,
  type DistanceUnit,
  type HrZone,
  type ModalityLike,
} from "@pt/shared";
import { INTERVAL_TYPE_LABEL } from "$lib/cardioForm";
import { formatDuration } from "$lib/ui/input/duration";

/**
 * A pace target as the modality reads it. It is always stored as seconds per
 * km (`paceSecPerKm`), and only shown and typed in the modality's metric:
 * pace per km or mile (run, walk), a /500 m split (row, SkiErg), a speed in
 * km/h or mph (bike), or nothing (elliptical, stairs).
 */
export type PaceField =
  | { kind: "duration"; unit: string; placeholder: string; min: number; max: number; show: (secPerKm: number) => number; store: (v: number) => number | undefined }
  | { kind: "speed"; unit: string; min: number; max: number; step: number; show: (secPerKm: number) => number; store: (v: number) => number | undefined }
  | null;

/**
 * The metric a prescribed pace reads in: the trainer's modality row or a preset
 * by name; a free-typed modality nobody defined keeps pace per km, so a coach's
 * pace never disappears.
 */
export function targetMetric(name: string | null | undefined, rows: readonly Pick<ModalityLike, "name" | "metric">[] = []): CardioMetric {
  const key = name?.trim().toLowerCase();
  if (!key) return "pace";
  const known = rows.some((r) => r.name.toLowerCase() === key) || MODALITY_PRESETS.some((p) => p.name.toLowerCase() === key);
  return known ? modalityMetric(name, rows) : "pace";
}

/** The schema's pace range, seconds per km. */
const MIN_SEC_PER_KM = 60;
const MAX_SEC_PER_KM = 1800;
const inRange = (sec: number) => (Number.isFinite(sec) && sec >= MIN_SEC_PER_KM && sec <= MAX_SEC_PER_KM ? Math.round(sec) : undefined);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A pace is stored as whole seconds per km, so a speed or a per-mile pace can't come back
 * exactly as typed (32.5 km/h → 111 s → 32.4). Show the first of `candidates` that stores
 * back to the same value — the field's round step first — so what the coach typed survives.
 */
function snapShown(secPerKm: number, candidates: number[], fallback: number, store: (v: number) => number | undefined): number {
  return candidates.find((v) => store(v) === secPerKm) ?? fallback;
}

/** The input for a pace target under this metric; null = the modality has no pace (elliptical, stairs, other). */
export function paceField(metric: CardioMetric, unit: DistanceUnit): PaceField {
  if (metric === "pace") {
    const per = unit === "mi" ? KM_PER_MI : 1;
    const store = (v: number) => inRange(v / per);
    return {
      kind: "duration",
      unit: `/${unit}`,
      placeholder: `m:ss /${unit}`,
      min: Math.ceil(MIN_SEC_PER_KM * per),
      max: Math.floor(MAX_SEC_PER_KM * per),
      show: (s) => {
        const raw = s * per;
        // a per-mile pace: a round 5 s (9:05) before the nearest second
        return per === 1 ? Math.round(raw) : snapShown(s, [Math.round(raw / 5) * 5, Math.round(raw)], Math.round(raw), store);
      },
      store,
    };
  }
  if (metric === "split") {
    return {
      kind: "duration",
      unit: "/500 m",
      placeholder: "m:ss /500 m",
      min: MIN_SEC_PER_KM / 2,
      max: MAX_SEC_PER_KM / 2,
      show: (s) => Math.round(s / 2),
      store: (v) => inRange(v * 2),
    };
  }
  if (metric === "speed") {
    const mph = unit === "mi";
    const store = (v: number) => (v > 0 ? inRange(3600 / (mph ? v * KM_PER_MI : v)) : undefined);
    return {
      kind: "speed",
      unit: mph ? "mph" : "km/h",
      min: mph ? 1.5 : 2,
      max: mph ? 37 : 60,
      step: 0.5,
      show: (s) => {
        const raw = mph ? kmToMi(3600 / s) : 3600 / s;
        return snapShown(s, [Math.round(raw * 2) / 2, round1(raw)], round1(raw), store);
      },
      store,
    };
  }
  return null;
}

/** A stored pace as the modality reads it: "5:20 /km", "8:35 /mi", "1:50 /500 m", "30 km/h"; null for no-pace modalities. */
export function paceTargetText(secPerKm: number, metric: CardioMetric, unit: DistanceUnit): string | null {
  if (metric === "pace") return unit === "mi" ? `${formatDuration(paceField("pace", "mi")!.show(secPerKm))} /mi` : formatPace(secPerKm, unit).replace("/", " /");
  if (metric === "split") return `${formatDuration(Math.round(secPerKm / 2))} /500 m`;
  if (metric === "speed") return `${paceField("speed", unit)!.show(secPerKm)} ${unit === "mi" ? "mph" : "km/h"}`;
  return null;
}

/** One line of the folded interval breakdown: "Work × 3 · 5:00 · Z4 · 149–168 bpm · 5:20 /km". */
export interface BreakdownLine {
  key: string;
  kind: "easy" | "work" | "recovery";
  /** "Warm-up", "Work × 3", "Active recovery × 2". */
  label: string;
  /** "5:00", "400 m", "—". */
  amount: string;
  zone: string | null;
  bpm: string | null;
  pace: string | null;
  rpe: string | null;
  notes: string | null;
}

const kindOfType = (t: CardioIntervalType): BreakdownLine["kind"] =>
  t === "work" ? "work" : t === "active_recovery" || t === "passive_recovery" ? "recovery" : "easy";

const amountText = (p: { durationSec?: number; distanceM?: number }) =>
  [p.durationSec ? formatDuration(p.durationSec) : null, p.distanceM ? (p.distanceM >= 1000 ? `${p.distanceM / 1000} km` : `${p.distanceM} m`) : null].filter(Boolean).join(" · ") || "—";

/**
 * Every part of an interval session in order, with its targets: warm-up, work
 * × reps, the recovery between them, cool-down. Bpm comes from the interval's
 * own band, else its zone in the member's profile; pace reads in the
 * modality's metric.
 */
export function intervalBreakdown(
  intervals: readonly CardioInterval[],
  o: { zones?: readonly HrZone[] | null; metric: CardioMetric; unit: DistanceUnit }
): BreakdownLine[] {
  const bpm = (band: { min: number; max: number } | null | undefined) => (band ? `${band.min}–${band.max} bpm` : null);
  const pace = (s: number | undefined) => (s ? paceTargetText(s, o.metric, o.unit) : null);
  const out: BreakdownLine[] = [];
  for (const iv of intervals) {
    const reps = iv.repeat ?? 1;
    const name = INTERVAL_TYPE_LABEL[iv.type];
    out.push({
      key: iv.id,
      kind: kindOfType(iv.type),
      label: reps > 1 ? `${name} × ${reps}` : name,
      amount: amountText(iv),
      zone: iv.hrZone ? `Z${iv.hrZone}` : null,
      bpm: bpm(iv.hrBpm ?? zoneBpm(o.zones, iv.hrZone)),
      pace: pace(iv.paceSecPerKm),
      rpe: iv.rpe != null ? `RPE ${iv.rpe}` : null,
      notes: iv.notes?.trim() || null,
    });
    const recs = recoveryCount(iv);
    if (iv.recovery && recs > 0) {
      const r = iv.recovery;
      out.push({
        key: `${iv.id}:rec`,
        kind: "recovery",
        label: `${INTERVAL_TYPE_LABEL[r.type ?? "passive_recovery"]} × ${recs}`,
        amount: amountText(r),
        zone: r.hrZone ? `Z${r.hrZone}` : null,
        bpm: bpm(zoneBpm(o.zones, r.hrZone)),
        pace: pace(r.paceSecPerKm),
        rpe: null,
        notes: iv.recoveryAfterLast ? "also after the last rep" : "between reps",
      });
    }
  }
  return out;
}
