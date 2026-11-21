import { z } from "zod";

/**
 * Display units. Everything is stored, sent to the AI and exported in metric
 * (kg, km); a trainer or member can choose to see and enter lb and miles. The
 * conversion happens only where a value is shown or typed, and kg stays the
 * source of truth so repeated round trips don't drift.
 */

export const WEIGHT_UNITS = ["kg", "lb"] as const;
export const DISTANCE_UNITS = ["km", "mi"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

export const DisplayUnits = z
  .object({
    weight: z.enum(WEIGHT_UNITS),
    distance: z.enum(DISTANCE_UNITS),
  })
  .strict();
export type DisplayUnits = z.infer<typeof DisplayUnits>;

export const DEFAULT_DISPLAY_UNITS: DisplayUnits = { weight: "kg", distance: "km" };

/** A stored preference, or the metric default when none (or a malformed one) is saved. */
export function displayUnitsOf(raw: unknown): DisplayUnits {
  const parsed = DisplayUnits.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_DISPLAY_UNITS;
}

export const LB_PER_KG = 2.2046226218;
export const KM_PER_MI = 1.609344;

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const kmToMi = (km: number) => km / KM_PER_MI;
export const miToKm = (mi: number) => mi * KM_PER_MI;

/** Stored kg → the number shown in `unit` (one decimal at most). */
export function weightIn(kg: number, unit: WeightUnit): number {
  return round(unit === "lb" ? kgToLb(kg) : kg, 1);
}

/** A typed number in `unit` → kg to store (two decimals, so lb survives the round trip). */
export function weightFrom(value: number, unit: WeightUnit): number {
  return round(unit === "lb" ? lbToKg(value) : value, 2);
}

/** Stored km → shown in `unit` (two decimals at most). */
export function distanceIn(km: number, unit: DistanceUnit): number {
  return round(unit === "mi" ? kmToMi(km) : km, 2);
}

/** A typed distance in `unit` → km to store (three decimals). */
export function distanceFrom(value: number, unit: DistanceUnit): number {
  return round(unit === "mi" ? miToKm(value) : value, 3);
}

/** Stepper increment: 2.5 kg plates map to 5 lb. */
export const weightStep = (unit: WeightUnit): number => (unit === "lb" ? 5 : 2.5);

/** A weight snapped to the unit's step, in that unit. */
export const snapWeight = (value: number, unit: WeightUnit): number => {
  const step = weightStep(unit);
  return round(Math.round(value / step) * step, 2);
};

const trim = (n: number) => String(n);

/** "100 kg" / "220.5 lb". */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${trim(weightIn(kg, unit))} ${unit}`;
}

/** "5.2 km" / "3.23 mi". */
export function formatDistance(km: number, unit: DistanceUnit): string {
  return `${trim(distanceIn(km, unit))} ${unit}`;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

/** Pace per km (stored) → "6:46/km" or "10:53/mi". */
export function formatPace(secPerKm: number, unit: DistanceUnit): string {
  const sec = Math.round(unit === "mi" ? secPerKm * KM_PER_MI : secPerKm);
  return `${mmss(sec)}/${unit}`;
}

/** Speed in km/h (stored) → "8.9 km/h" or "5.5 mph". */
export function formatSpeed(kmh: number, unit: DistanceUnit): string {
  return unit === "mi" ? `${round(kmToMi(kmh), 1)} mph` : `${round(kmh, 1)} km/h`;
}

/** Parse typed text ("135", "62,5") into kg; null for anything that isn't a positive number. */
export function parseWeight(text: string, unit: WeightUnit): number | null {
  const n = Number(text.trim().replace(",", "."));
  if (!text.trim() || !Number.isFinite(n) || n < 0) return null;
  return weightFrom(n, unit);
}

/** Parse typed text into km; null when not a non-negative number. */
export function parseDistance(text: string, unit: DistanceUnit): number | null {
  const n = Number(text.trim().replace(",", "."));
  if (!text.trim() || !Number.isFinite(n) || n < 0) return null;
  return distanceFrom(n, unit);
}
