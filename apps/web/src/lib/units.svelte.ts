import {
  DEFAULT_DISPLAY_UNITS,
  displayUnitsOf,
  distanceFrom,
  distanceIn,
  formatLoad,
  formatPace,
  formatSpeed,
  loadIn,
  KM_PER_MI,
  weightFrom,
  weightIn,
  weightStep,
  type DisplayUnits,
  type DistanceUnit,
  type WeightUnit,
} from "@pt/shared";

/**
 * The trainer's display units, as rune state. Weights are stored in kg and
 * distances in km everywhere; these helpers convert only where a value is
 * shown or typed. Each helper takes the unit as its last argument and
 * defaults to the current preference, so pure formatters stay testable and
 * still re-render when the preference changes (reading `units` tracks it).
 */

const KEY = "pt.displayUnits";
/** The member portal keeps its own copy: a trainer opening the portal demo keeps theirs. */
export const PORTAL_UNITS_KEY = "pt.portal.displayUnits";

export const units = $state<DisplayUnits>({ ...DEFAULT_DISPLAY_UNITS });

/** Apply a preference (from the API, or the copy cached for a fast first paint). */
export function applyUnits(next: unknown, key = KEY) {
  const u = displayUnitsOf(next);
  units.weight = u.weight;
  units.distance = u.distance;
  try {
    localStorage.setItem(key, JSON.stringify(u));
  } catch {
    /* private mode */
  }
}

/** The cached copy, before the API answers (none cached: the metric default). */
export function restoreUnits(key = KEY) {
  try {
    const raw = localStorage.getItem(key);
    applyUnits(raw ? JSON.parse(raw) : DEFAULT_DISPLAY_UNITS, key);
  } catch {
    /* junk or no storage: stay on the defaults */
  }
}

const wu = (u?: WeightUnit) => u ?? units.weight;
const du = (u?: DistanceUnit) => u ?? units.distance;

/** "kg" / "lb". */
export const weightUnit = (u?: WeightUnit): WeightUnit => wu(u);
/** "km" / "mi". */
export const distanceUnit = (u?: DistanceUnit): DistanceUnit => du(u);

/** Stored kg → the number shown. */
export const showWeight = (kg: number, u?: WeightUnit) => weightIn(kg, wu(u));
/** A typed number → kg to store. */
export const storeWeight = (v: number, u?: WeightUnit) => weightFrom(v, wu(u));
/** "100 kg" / "220.5 lb" — `sep` "" gives the compact "100kg". */
export function fmtWeight(kg: number, u?: WeightUnit, sep = " "): string {
  return `${trim(showWeight(kg, u))}${sep}${wu(u)}`;
}

/** A load on the plate grid: the number a stepper shows (82.5 lb for 37.5 kg). */
export const showLoad = (kg: number, u?: WeightUnit) => loadIn(kg, wu(u)).value;
/** A kg load moved onto the shown plate grid, still as kg: 62.5 kg → 62.37 kg (137.5 lb); kg passes through. */
export const gridKg = (kg: number, u?: WeightUnit) => (wu(u) === "kg" ? kg : storeWeight(showLoad(kg, u), u));
/** A prescribed load as text: "37.5 kg", "≈ 82.5 lb". */
export const fmtLoad = (kg: number, u?: WeightUnit, sep = " ") => formatLoad(kg, wu(u), sep);

/** Whole-number figures for totals and e1RMs: "4,250 kg", "9,370 lb". */
export function fmtWeightRound(kg: number, u?: WeightUnit, sep = " "): string {
  return `${Math.round(showWeight(kg, u)).toLocaleString("en-US")}${sep}${wu(u)}`;
}

/** Volume ticks: "850kg" / "4.3t" (kg), "1,874lb" / "9.4k lb" (lb). */
export function fmtTonnage(kg: number, u?: WeightUnit, sep = ""): string {
  const v = showWeight(kg, u);
  if (wu(u) === "lb") return v >= 10000 ? `${(v / 1000).toFixed(1)}k${sep || " "}lb` : `${Math.round(v).toLocaleString("en-US")}${sep}lb`;
  return v >= 1000 ? `${(v / 1000).toFixed(1)}${sep}t` : `${Math.round(v)}${sep}kg`;
}

/** Plate step in the shown unit: 2.5 kg, 5 lb. */
export const weightStepIn = (u?: WeightUnit) => weightStep(wu(u));

/** Stored km → shown. */
export const showDistance = (km: number, u?: DistanceUnit) => distanceIn(km, du(u));
export const storeDistance = (v: number, u?: DistanceUnit) => distanceFrom(v, du(u));
/** "5.2 km" / "3.23 mi". */
export const fmtDistance = (km: number, u?: DistanceUnit) => `${trim(showDistance(km, u))} ${du(u)}`;
/** Pace per km (stored) → "6:46 /km" / "10:53 /mi". */
export const fmtPace = (secPerKm: number, u?: DistanceUnit) => formatPace(secPerKm, du(u)).replace("/", " /");
export const fmtSpeed = (kmh: number, u?: DistanceUnit) => formatSpeed(kmh, du(u));
/** Pace per km ↔ per shown unit, for a pace input. */
export const showPace = (secPerKm: number, u?: DistanceUnit) => Math.round(du(u) === "mi" ? secPerKm * KM_PER_MI : secPerKm);
export const storePace = (sec: number, u?: DistanceUnit) => Math.round(du(u) === "mi" ? sec / KM_PER_MI : sec);

const trim = (n: number) => String(n);

type Cell = string | number | null | undefined;

/**
 * A log-sheet weight cell (stored kg) behind an input in the display unit.
 * In kg it passes values through untouched. In lb it remembers what was typed
 * per row, so "62.25" stays "62.25" while the cell holds exact kg (a plain
 * kg → lb conversion would round it to 62.3 under the cursor). An untyped kg
 * shows on the 2.5 lb plate grid (37.5 kg → 82.5), so ± 5 lb lands on plates;
 * the cell keeps its exact kg until the field is edited.
 */
export function weightCells() {
  const typed = new Map<string, number>();
  return {
    get(key: string, cell: Cell): Cell {
      if (units.weight === "kg" || typeof cell !== "number") return cell;
      const t = typed.get(key);
      return t != null && storeWeight(t) === cell ? t : showLoad(cell);
    },
    set(key: string, v: Cell): Cell {
      if (units.weight === "kg" || typeof v !== "number" || !Number.isFinite(v)) return v;
      typed.set(key, v);
      return storeWeight(v);
    },
  };
}
