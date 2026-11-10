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
    sources: [
      "Bompa & Haff 2009, Periodization: Theory and Methodology of Training, 5th ed. (Human Kinetics) — step loading",
      "Rhea & Alderman 2004, Res Q Exerc Sport 75(4):413–422 — periodized vs non-periodized meta-analysis",
    ],
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
    summary: "Concentrated blocks: build work capacity with volume, convert it with heavier loads, then cut volume to express strength. Evidence comes mostly from athletes and is still debated.",
    sources: [
      "Issurin 2010, Sports Med 40(3):189–206 — new horizons for the methodology and physiology of training periodization",
      "Painter et al. 2012, Int J Sports Physiol Perform 7(2):161–169 — block vs daily undulating: similar strength, block used less volume",
      "Kiely 2010, Sports Med 40(9):803–805 — critique: block periodization lacks strong comparative evidence",
    ],
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
    summary: "More weekly sets grow more muscle (graded dose-response). Ramping a set a week, then deloading, is the coaching model built on that.",
    sources: [
      "Schoenfeld, Ogborn & Krieger 2017, J Sports Sci 35(11):1073–1082 — weekly set dose-response for hypertrophy (meta-analysis)",
      "Coaching model, not a study: Israetel, Hoffmann & Smith, Scientific Principles of Hypertrophy Training (Renaissance Periodization) — MEV → MRV ramp",
    ],
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
    summary: "Alternate volume and intensity weeks for variety. Evidence is mixed: undulating plans (mostly daily) edge out linear for max strength, but the one weekly-undulating trial found linear better.",
    sources: [
      "Apel, Lacey & Kell 2011, J Strength Cond Res 25(3):694–703 — weekly undulating vs traditional: traditional stronger at 12 weeks",
      "Caldas et al. 2016, Int J Sports Sci 6(6):219–229 — meta-analysis: undulating slightly better for max strength, not hypertrophy",
      "Rhea et al. 2002, J Strength Cond Res 16(2):250–255 — daily undulating beat linear for strength",
    ],
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
    sources: [
      "Bosquet et al. 2007, Med Sci Sports Exerc 39(8):1358–1365 — taper meta-analysis: 2 weeks, volume −41–60 %",
      "Pritchard et al. 2015, Strength Cond J 37(2):72–83 — effects and mechanisms of tapering for maximal strength",
      "Pritchard et al. 2016, J Strength Cond Res 30(7):1796–1804 — elite raw powerlifters' tapers: volume −59 %, intensity kept",
    ],
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
    summary: "Coaching practice: beginners progress on lower loads and doses, so adding a little weight each week works until it stalls. Not a tested protocol.",
    sources: [
      "Rhea et al. 2003, Med Sci Sports Exerc 35(3):456–464 — dose-response for strength: untrained gain most at ~60 % 1RM, trained at ~80 %",
    ],
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
    summary: "Coaching practice after a layoff: rebuild volume before load. Short breaks cost little strength but more work capacity. The ramp itself is not a tested protocol.",
    sources: [
      "Mujika & Padilla 2000, Sports Med 30(2):79–87 and 30(3):145–154 — detraining: what is lost, and how fast",
    ],
    phase: "reintroduction",
    nextPhase: "accumulation",
    weeks: [
      { week: 1, directive: "base", note: "Rule of thumb: about 60% of usual volume, RPE ≤ 7." },
      { week: 2, directive: "+volume", progression: { kind: "sets", amount: 1 } },
      { week: 3, directive: "+volume", progression: { kind: "sets", amount: 1 } },
      { week: 4, directive: "+intensity", progression: { kind: "percent", amount: 2.5 } },
    ],
  },
];

export const schemePreset = (key: string): SchemePreset | undefined => SCHEME_PRESETS.find((p) => p.key === key);
