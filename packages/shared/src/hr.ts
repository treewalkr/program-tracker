import { z } from "zod";

/**
 * Heart-rate zones and versioned member HR profiles. Pure: the API stores the
 * zones these functions compute, and resolves a session's bpm targets from the
 * profile version in effect on the session's date.
 *
 * A method whose inputs are missing is unavailable — nothing is estimated
 * (no 220 − age, no guessed LTHR).
 */

export const HR_ZONE_METHODS = ["hrmax", "karvonen", "lthr", "custom"] as const;
export const HrZoneMethod = z.enum(HR_ZONE_METHODS);
export type HrZoneMethod = z.infer<typeof HrZoneMethod>;

const Bpm = z.number().int().min(30).max(240);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const HrZone = z.object({
  zone: z.number().int().min(1).max(5),
  min: Bpm,
  max: Bpm,
});
export type HrZone = z.infer<typeof HrZone>;

export const HrZones = z.array(HrZone).length(5);
export type HrZones = z.infer<typeof HrZones>;

/** The inputs a profile can carry; which are needed depends on the method. */
export interface HrInputs {
  restingHr?: number | null;
  maxHr?: number | null;
  lthr?: number | null;
}

/** Lower bound of zones 1–5 as a fraction, and the top of zone 5. */
const BANDS: Record<Exclude<HrZoneMethod, "custom">, { lows: number[]; top: number }> = {
  // %HRmax: 50 / 60 / 70 / 80 / 90 – 100 %
  hrmax: { lows: [0.5, 0.6, 0.7, 0.8, 0.9], top: 1 },
  // Karvonen: the same fractions of heart-rate reserve, added to resting HR
  karvonen: { lows: [0.5, 0.6, 0.7, 0.8, 0.9], top: 1 },
  // %LTHR: 65 / 85 / 90 / 95 / 100 – 106 % of lactate-threshold HR
  lthr: { lows: [0.65, 0.85, 0.9, 0.95, 1.0], top: 1.06 },
};

/** Inputs a method needs; empty = available. */
export function missingHrInputs(method: HrZoneMethod, inputs: HrInputs): ("restingHr" | "maxHr" | "lthr")[] {
  if (method === "hrmax") return inputs.maxHr ? [] : ["maxHr"];
  if (method === "karvonen") {
    const out: ("restingHr" | "maxHr")[] = [];
    if (!inputs.restingHr) out.push("restingHr");
    if (!inputs.maxHr) out.push("maxHr");
    return out;
  }
  if (method === "lthr") return inputs.lthr ? [] : ["lthr"];
  return [];
}

/** The methods the member's recorded inputs allow (custom is always possible). */
export function availableHrMethods(inputs: HrInputs): HrZoneMethod[] {
  return HR_ZONE_METHODS.filter((m) => missingHrInputs(m, inputs).length === 0);
}

/**
 * Five contiguous zones for a computed method, or null when an input is
 * missing. Each zone ends one bpm below the next one's start.
 */
export function computeHrZones(method: Exclude<HrZoneMethod, "custom">, inputs: HrInputs): HrZones | null {
  if (missingHrInputs(method, inputs).length) return null;
  const { lows, top } = BANDS[method];
  let at: (f: number) => number;
  if (method === "hrmax") at = (f) => Math.round(inputs.maxHr! * f);
  else if (method === "karvonen") {
    const rest = inputs.restingHr!;
    const reserve = inputs.maxHr! - rest;
    if (reserve <= 0) return null;
    at = (f) => Math.round(rest + reserve * f);
  } else at = (f) => Math.round(inputs.lthr! * f);
  const mins = lows.map(at);
  return mins.map((min, i) => ({ zone: i + 1, min, max: i < 4 ? mins[i + 1] - 1 : at(top) }));
}

/** Gaps, overlaps and inverted bands in a zone table (empty = fine). */
export function zoneIssues(zones: readonly HrZone[]): string[] {
  const issues: string[] = [];
  const sorted = [...zones].sort((a, b) => a.zone - b.zone);
  if (sorted.length !== 5 || sorted.some((z, i) => z.zone !== i + 1)) issues.push("zones must be 1 to 5, once each");
  sorted.forEach((z, i) => {
    if (z.min > z.max) issues.push(`zone ${z.zone}: min must be ≤ max`);
    const prev = sorted[i - 1];
    if (!prev) return;
    if (z.min > prev.max + 1) issues.push(`gap between zone ${prev.zone} and zone ${z.zone} (${prev.max + 1}–${z.min - 1} bpm)`);
    if (z.min <= prev.max) issues.push(`zone ${prev.zone} and zone ${z.zone} overlap`);
  });
  return issues;
}

/** What a trainer sends to start a new HR profile version. */
export const HrProfileInput = z
  .object({
    effectiveFrom: IsoDate,
    method: HrZoneMethod,
    restingHr: Bpm.nullable().optional(),
    maxHr: Bpm.nullable().optional(),
    /** When the max was measured; absent = an age estimate the trainer chose to trust. */
    maxHrTestedOn: IsoDate.nullable().optional(),
    lthr: Bpm.nullable().optional(),
    /** Custom method only: the trainer's own table. */
    zones: HrZones.nullable().optional(),
  })
  .superRefine((p, ctx) => {
    for (const field of missingHrInputs(p.method, p)) {
      ctx.addIssue({ code: "custom", message: `${p.method} zones need ${field}`, path: [field] });
    }
    if (p.restingHr && p.maxHr && p.restingHr >= p.maxHr) {
      ctx.addIssue({ code: "custom", message: "resting HR must be below max HR", path: ["restingHr"] });
    }
    if (p.method === "custom") {
      if (!p.zones) ctx.addIssue({ code: "custom", message: "custom zones need a zone table", path: ["zones"] });
      else for (const message of zoneIssues(p.zones)) ctx.addIssue({ code: "custom", message, path: ["zones"] });
    }
  });
export type HrProfileInput = z.infer<typeof HrProfileInput>;

/** The zones a valid input stands for: computed, or the custom table. */
export function profileZones(input: HrProfileInput): HrZones | null {
  if (input.method === "custom") return input.zones ?? null;
  return computeHrZones(input.method, input);
}

/** A stored version — what `profileOn` needs. */
export interface HrProfileVersion {
  version: number;
  effectiveFrom: string;
  zones: HrZones;
}

/** The version in effect on `date` (YYYY-MM-DD): latest effectiveFrom ≤ date, newest version on a tie. */
export function profileOn<T extends HrProfileVersion>(versions: readonly T[], date: string): T | null {
  let best: T | null = null;
  for (const v of versions) {
    if (v.effectiveFrom > date) continue;
    if (!best || v.effectiveFrom > best.effectiveFrom || (v.effectiveFrom === best.effectiveFrom && v.version > best.version)) best = v;
  }
  return best;
}

/** One zone's bpm band from a table; null when the zone isn't there. */
export function zoneBpm(zones: readonly HrZone[] | null | undefined, zone: number | null | undefined): { min: number; max: number } | null {
  if (!zones || zone == null) return null;
  const z = zones.find((x) => x.zone === zone);
  return z ? { min: z.min, max: z.max } : null;
}
