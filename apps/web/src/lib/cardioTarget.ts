import { KM_PER_MI, MODALITY_PRESETS, formatPace, formatSpeed, kmToMi, modalityMetric, type CardioMetric, type DistanceUnit, type ModalityLike } from "@pt/shared";
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

/** The input for a pace target under this metric; null = the modality has no pace (elliptical, stairs, other). */
export function paceField(metric: CardioMetric, unit: DistanceUnit): PaceField {
  if (metric === "pace") {
    const per = unit === "mi" ? KM_PER_MI : 1;
    return {
      kind: "duration",
      unit: `/${unit}`,
      placeholder: `m:ss /${unit}`,
      min: Math.ceil(MIN_SEC_PER_KM * per),
      max: Math.floor(MAX_SEC_PER_KM * per),
      show: (s) => Math.round(s * per),
      store: (v) => inRange(v / per),
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
    return {
      kind: "speed",
      unit: mph ? "mph" : "km/h",
      min: mph ? 1.5 : 2,
      max: mph ? 37 : 60,
      step: 0.5,
      show: (s) => round1(mph ? kmToMi(3600 / s) : 3600 / s),
      store: (v) => (v > 0 ? inRange(3600 / (mph ? v * KM_PER_MI : v)) : undefined),
    };
  }
  return null;
}

/** A stored pace as the modality reads it: "5:20 /km", "8:35 /mi", "1:50 /500 m", "30 km/h"; null for no-pace modalities. */
export function paceTargetText(secPerKm: number, metric: CardioMetric, unit: DistanceUnit): string | null {
  if (metric === "pace") return formatPace(secPerKm, unit).replace("/", " /");
  if (metric === "split") return `${formatDuration(Math.round(secPerKm / 2))} /500 m`;
  if (metric === "speed") return formatSpeed(3600 / secPerKm, unit);
  return null;
}
