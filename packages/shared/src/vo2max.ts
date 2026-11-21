import { z } from "zod";
import { ageOn } from "./client";

/**
 * VO₂max field-test estimates (ml·kg⁻¹·min⁻¹). Each protocol is one published
 * equation with a version and a citation, so a stored result can say which
 * formula made it. These are estimates from a field test, not lab values, and
 * each has its own population caveat (shown in the UI).
 */

export const VO2_PROTOCOLS = ["cooper_12min", "run_1_5mile", "rockport_walk"] as const;
export const Vo2Protocol = z.enum(VO2_PROTOCOLS);
export type Vo2Protocol = z.infer<typeof Vo2Protocol>;

export interface Vo2Formula {
  version: string;
  source: string;
  /** Who the equation was derived on — the caveat the UI shows. */
  population: string;
}

export const VO2_FORMULAS: Record<Vo2Protocol, Vo2Formula> = {
  cooper_12min: {
    version: "cooper-1968",
    source: "Cooper KH. A means of assessing maximal oxygen intake. JAMA. 1968;203(3):201-204.",
    population: "Young, active men; less accurate for walkers or people who can't pace 12 minutes.",
  },
  run_1_5mile: {
    version: "acsm-1.5mi",
    source: "ACSM's Guidelines for Exercise Testing and Prescription (1.5-mile run: VO2max = 3.5 + 483 / minutes).",
    population: "Adults able to run 1.5 miles at a hard, even pace.",
  },
  rockport_walk: {
    version: "kline-1987",
    source: "Kline GM et al. Estimation of VO2max from a one-mile track walk. Med Sci Sports Exerc. 1987;19(3):253-259.",
    population: "Adults aged 30–69; suited to beginners and walkers. Needs a recorded sex.",
  },
};

const Seconds = z.number().int().min(60).max(4 * 3600);

/** What the trainer enters per protocol; the server computes the result from these. */
export const Vo2Inputs = {
  cooper_12min: z.object({ distanceM: z.number().int().min(200).max(6000) }).strict(),
  run_1_5mile: z.object({ timeSec: Seconds }).strict(),
  rockport_walk: z
    .object({
      timeSec: Seconds,
      /** Heart rate at the end of the mile. */
      heartRate: z.number().int().min(40).max(240),
      weightKg: z.number().min(20).max(300),
    })
    .strict(),
} as const;
export type Vo2InputsOf<P extends Vo2Protocol> = z.infer<(typeof Vo2Inputs)[P]>;

/** The member facts a protocol may need, as recorded on the client. */
export interface Vo2Member {
  sex?: "female" | "male" | null;
  birthDate?: string | null;
}

export type Vo2Result = { ok: true; value: number; formulaVersion: string } | { ok: false; error: string };

const LB_PER_KG = 2.2046226218;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Cooper 1968: VO₂max = (metres in 12 min − 504.9) / 44.73. */
export function cooperVo2(distanceM: number): number {
  return round1((distanceM - 504.9) / 44.73);
}

/** ACSM 1.5-mile run: VO₂max = 3.5 + 483 / minutes. */
export function run15MileVo2(timeSec: number): number {
  return round1(3.5 + 483 / (timeSec / 60));
}

/**
 * Kline 1987 (Rockport): 132.853 − 0.0769·lb − 0.3877·age + 6.315·sex
 * − 3.2649·minutes − 0.1565·HR, sex 1 = male, 0 = female.
 */
export function rockportVo2(i: { weightKg: number; age: number; sex: "female" | "male"; timeSec: number; heartRate: number }): number {
  const lb = i.weightKg * LB_PER_KG;
  const male = i.sex === "male" ? 1 : 0;
  return round1(132.853 - 0.0769 * lb - 0.3877 * i.age + 6.315 * male - 3.2649 * (i.timeSec / 60) - 0.1565 * i.heartRate);
}

/**
 * Validate a protocol's inputs and compute the estimate. Nothing is guessed:
 * Rockport without a recorded sex or birth date is an error.
 */
export function estimateVo2(protocol: Vo2Protocol, inputs: unknown, member: Vo2Member, testedOn: string): Vo2Result {
  const formulaVersion = VO2_FORMULAS[protocol].version;
  const parsed = Vo2Inputs[protocol].safeParse(inputs);
  if (!parsed.success) return { ok: false, error: `invalid ${protocol} inputs: ${parsed.error.issues.map((i) => `${i.path.join(".") || "inputs"} ${i.message}`).join("; ")}` };
  if (protocol === "cooper_12min") {
    return { ok: true, value: cooperVo2((parsed.data as Vo2InputsOf<"cooper_12min">).distanceM), formulaVersion };
  }
  if (protocol === "run_1_5mile") {
    return { ok: true, value: run15MileVo2((parsed.data as Vo2InputsOf<"run_1_5mile">).timeSec), formulaVersion };
  }
  const r = parsed.data as Vo2InputsOf<"rockport_walk">;
  if (!member.sex) return { ok: false, error: "Rockport needs the member's sex recorded" };
  if (!member.birthDate) return { ok: false, error: "Rockport needs the member's birth date recorded" };
  const age = ageOn(member.birthDate, testedOn);
  if (age < 1) return { ok: false, error: "birth date must be before the test date" };
  return { ok: true, value: rockportVo2({ ...r, age, sex: member.sex }), formulaVersion };
}
