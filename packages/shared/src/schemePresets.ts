import { DELOAD_VOLUME_DELTA_PERCENT } from "./deload";
import type { WeekPlan } from "./domain";

// ---------------------------------------------------------------------------
// Built-in progression schemes. Read-only and versioned with the code: every
// trainer sees the current set; they can hide one or duplicate it into an
// editable scheme of their own. Each week passes PeriodizationSchemeInput and
// its `progression` rule is what applyProgression (progression.ts) runs.
// ---------------------------------------------------------------------------

export const SCHEME_PRESET_GOALS = ["strength", "hypertrophy", "peaking", "general"] as const;
export type SchemePresetGoal = (typeof SCHEME_PRESET_GOALS)[number];

export interface SchemePreset {
  key: string;
  name: string;
  goal: SchemePresetGoal;
  /** One plain line: why it works / when to use it. */
  summary: string;
  /** Short citations. */
  sources: string[];
  /** Suggested Phasing.phase / nextPhase for a program built on it. */
  phase: string;
  nextPhase: string;
  weeks: WeekPlan[];
}

const deload = (week: number, note?: string): WeekPlan => ({
  week,
  directive: "deload",
  target: { metric: "overall_volume", deltaPercent: DELOAD_VOLUME_DELTA_PERCENT },
  ...(note ? { note } : {}),
});

export const SCHEME_PRESETS: readonly SchemePreset[] = [
  {
    key: "linear-3-1",
    name: "Linear strength 3:1",
    goal: "strength",
    summary: "Three weeks of rising load, then a deload to let fatigue clear — simple step loading that suits most intermediate lifters.",
    sources: ["Bompa & Haff, Periodization: Theory and Methodology of Training (step loading)", "Rhea & Alderman 2004, Res Q Exerc Sport — periodized vs non-periodized meta-analysis"],
    phase: "intensification",
    nextPhase: "accumulation",
    weeks: [
      { week: 1, directive: "base", note: "Working sets around RPE 7 — leave room to climb." },
      { week: 2, directive: "+intensity", target: { metric: "intensity", deltaPercent: 3 }, progression: { kind: "percent", amount: 2.5 } },
      { week: 3, directive: "+intensity", target: { metric: "intensity", deltaPercent: 3 }, progression: { kind: "percent", amount: 2.5 } },
      deload(4),
    ],
  },
  {
    key: "block",
    name: "Block (accumulate → transmute → realize)",
    goal: "strength",
    summary: "Concentrated blocks: build work capacity with volume, convert it with heavier loads, then cut volume to express strength.",
    sources: ["Issurin 2010, Sports Med — new horizons for the methodology and physiology of training periodization"],
    phase: "accumulation",
    nextPhase: "transition",
    weeks: [
      { week: 1, directive: "base", note: "Accumulation: moderate loads, higher reps." },
      { week: 2, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 10 }, progression: { kind: "sets", amount: 1 } },
      { week: 3, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 }, note: "Add a rep or two per set to reach about +5 % volume." },
      { week: 4, directive: "+intensity", target: { metric: "overall_volume", deltaPercent: -15 }, progression: { kind: "percent", amount: 5 }, note: "Transmutation: heavier, fewer reps per set." },
      { week: 5, directive: "+intensity", progression: { kind: "percent", amount: 2.5 } },
      { week: 6, directive: "test", target: { metric: "overall_volume", deltaPercent: -40 }, progression: { kind: "sets", amount: -1 }, note: "Realization: work up to a heavy single or rep max." },
    ],
  },
  {
    key: "hypertrophy-ramp",
    name: "Hypertrophy volume ramp",
    goal: "hypertrophy",
    summary: "Start near the least volume that still grows muscle and add a set each week, then deload before fatigue outruns gains.",
    sources: ["Schoenfeld, Ogborn & Krieger 2017, J Sports Sci — weekly set dose-response for hypertrophy", "Israetel, Hoffmann & Smith, Scientific Principles of Hypertrophy Training (MEV → MRV)"],
    phase: "accumulation",
    nextPhase: "intensification",
    weeks: [
      { week: 1, directive: "base", note: "Start near minimum effective volume; sets at RIR 2–3." },
      { week: 2, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 33 }, progression: { kind: "sets", amount: 1 } },
      { week: 3, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 25 }, progression: { kind: "sets", amount: 1 } },
      { week: 4, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 20 }, progression: { kind: "sets", amount: 1 }, note: "Last hard week — RIR 0–1 on the final sets." },
      deload(5),
    ],
  },
  {
    key: "undulating",
    name: "Weekly undulating",
    goal: "general",
    summary: "Alternate volume and intensity weeks so neither stress piles up — matches or beats linear plans in trained lifters.",
    sources: ["Rhea et al. 2002, J Strength Cond Res — linear vs daily undulating periodization", "Painter et al. 2012, J Strength Cond Res — block vs daily undulating in athletes"],
    phase: "accumulation",
    nextPhase: "intensification",
    weeks: [
      { week: 1, directive: "base" },
      { week: 2, directive: "+volume", progression: { kind: "sets", amount: 1 } },
      { week: 3, directive: "+intensity", progression: { kind: "sets", amount: -1 }, note: "+5% 1RM, 2 fewer reps per set." },
      { week: 4, directive: "+volume", progression: { kind: "sets", amount: 1 } },
      deload(5),
    ],
  },
  {
    key: "peak-taper",
    name: "Peak & taper",
    goal: "peaking",
    summary: "Keep loads heavy while cutting volume 40–60 % so fatigue drops faster than fitness before a test or meet.",
    sources: ["Bosquet et al. 2007, Med Sci Sports Exerc — taper meta-analysis (volume −41–60 %)", "Pritchard et al. 2015, Sports Med — tapering practices of strength athletes"],
    phase: "realization",
    nextPhase: "transition",
    weeks: [
      { week: 1, directive: "+intensity", target: { metric: "overall_volume", deltaPercent: -20 }, note: "Loads about +2.5 % 1RM over last block's top sets; drop a back-off set." },
      { week: 2, directive: "+intensity", target: { metric: "overall_volume", deltaPercent: -40 }, progression: { kind: "sets", amount: -1 }, note: "Keep intensity — fewer sets, same heavy loads." },
      { week: 3, directive: "test", note: "Openers early in the week, test or compete at the end." },
    ],
  },
  {
    key: "novice-linear",
    name: "Novice linear",
    goal: "strength",
    summary: "Beginners recover fast enough to add load every week — keep it simple until progress stalls.",
    sources: ["Rhea et al. 2003, Med Sci Sports Exerc — dose-response for strength (untrained vs trained)"],
    phase: "linear progression",
    nextPhase: "intensification",
    weeks: [
      { week: 1, directive: "base", note: "Repeat a week on a miss; after 2 stalls drop the load 10 %." },
      { week: 2, directive: "+intensity", progression: { kind: "kg", amount: 2.5 } },
      { week: 3, directive: "+intensity", progression: { kind: "kg", amount: 2.5 } },
      { week: 4, directive: "+intensity", progression: { kind: "kg", amount: 2.5 } },
      { week: 5, directive: "+intensity", progression: { kind: "kg", amount: 2.5 } },
      { week: 6, directive: "+intensity", progression: { kind: "kg", amount: 2.5 } },
    ],
  },
  {
    key: "return-to-train",
    name: "Return to training",
    goal: "general",
    summary: "After a layoff, rebuild volume before load — strength comes back quickly, tendons and work capacity take longer.",
    sources: ["Mujika & Padilla 2000, Sports Med — detraining: loss of training-induced adaptations"],
    phase: "reintroduction",
    nextPhase: "accumulation",
    weeks: [
      { week: 1, directive: "base", note: "≈60% usual volume, RPE ≤ 7." },
      { week: 2, directive: "+volume", progression: { kind: "sets", amount: 1 } },
      { week: 3, directive: "+volume", progression: { kind: "sets", amount: 1 } },
      { week: 4, directive: "+intensity", progression: { kind: "percent", amount: 2.5 } },
    ],
  },
];

export const schemePreset = (key: string): SchemePreset | undefined => SCHEME_PRESETS.find((p) => p.key === key);
