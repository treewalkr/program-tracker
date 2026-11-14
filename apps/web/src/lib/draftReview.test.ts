import { describe, expect, test } from "bun:test";
import {
  ago,
  defaultPlan,
  historyEntries,
  normalizePlan,
  planChanges,
  planIndexes,
  draftSessionTags,
  rationaleByDay,
  reviewChecks,
  validatePlanWeek,
  setProgression,
  clientDeload,
  deloadLoadPhrase,
  type PlanWeek,
  weekTargetLabel,
} from "./draftReview";
import { DEFAULT_DELOAD, DELOAD_VOLUME_DELTA_PERCENT, RATIONALE_SESSION_LEAD_EXAMPLE, formatPatternBalance, sessionsPatternBalance, type DeloadSettings } from "@pt/shared";
import type { AiDraftDto, GenerationDto, ProgramPhasingDto } from "./api/types";

const plan: ProgramPhasingDto = {
  phase: "accumulation",
  nextPhase: "intensification",
  plannedWeeks: 4,
  weeks: [
    { week: 1, directive: "base", note: "Learn" },
    { week: 2, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 } },
    { week: 3, directive: "+intensity", target: { metric: "intensity", deltaPercent: 2.5 } },
    { week: 4, directive: "deload", target: { metric: "overall_volume", deltaPercent: -40 } },
  ],
};

describe("block plan helpers", () => {
  test("weekTargetLabel", () => {
    expect(weekTargetLabel(plan.weeks![1])).toBe("+5% volume");
    expect(weekTargetLabel(plan.weeks![2])).toBe("+2.5% load");
    expect(weekTargetLabel(plan.weeks![3])).toBe("-40% volume");
    expect(weekTargetLabel(plan.weeks![0])).toBe("");
  });

  test("planIndexes chains volume and load from the targets", () => {
    const idx = planIndexes(plan).map((x) => [Math.round(x.vol), +x.load.toFixed(1)]);
    expect(idx).toEqual([[100, 100], [105, 100], [105, 102.5], [63, 92.3]]);
  });

  test("planIndexes uses a deload week's intensity target instead of the deload rule", () => {
    const ph: ProgramPhasingDto = {
      ...plan,
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "deload", target: { metric: "intensity", deltaPercent: -5 } },
      ],
    };
    expect(planIndexes(ph).map((x) => [Math.round(x.vol), +x.load.toFixed(1)])).toEqual([[100, 100], [100, 95]]);
  });

  test("planIndexes resumes from pre-deload values after a deload", () => {
    const ph: ProgramPhasingDto = {
      ...plan,
      weeks: [
        ...plan.weeks!,
        { week: 5, directive: "deload", target: { metric: "overall_volume", deltaPercent: -50 } },
        { week: 6, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 } },
      ],
    };
    const idx = planIndexes(ph).map((x) => [+x.vol.toFixed(1), +x.load.toFixed(1)]);
    expect(idx.slice(3)).toEqual([[63, 92.3], [52.5, 92.3], [110.3, 102.5]]);
  });

  test("planChanges lists directive, target, note and phase edits", () => {
    const b = structuredClone(plan);
    b.weeks![1] = { week: 2, directive: "deload", target: { metric: "overall_volume", deltaPercent: -30 }, note: "Travel" };
    b.nextPhase = "peak";
    expect(planChanges(plan, b)).toEqual([
      { week: null, where: "Next block", from: "intensification", to: "peak" },
      { week: 2, where: "W2", from: "+volume", to: "deload" },
      { week: 2, where: "W2 target", from: "+5% volume", to: "-30% volume" },
      { week: 2, where: "W2 note", from: null, to: "edited" },
    ]);
  });

  test("planChanges reports added and removed weeks", () => {
    const longer = normalizePlan({ ...plan, weeks: [...plan.weeks!, { week: 5, directive: "test" }] });
    expect(planChanges(plan, longer)).toEqual([{ week: 5, where: "W5", from: null, to: "added · test" }]);
    expect(planChanges(longer, plan)).toEqual([{ week: 5, where: "W5", from: "test", to: "removed" }]);
  });

  test("validatePlanWeek", () => {
    expect(validatePlanWeek({ week: 1, directive: "deload", target: { metric: "overall_volume", deltaPercent: 10 } })?.kind).toBe("warn");
    expect(validatePlanWeek({ week: 1, directive: "+volume" })?.kind).toBe("warn");
    expect(validatePlanWeek({ week: 1, directive: "base", target: { metric: "intensity", deltaPercent: 250 } })?.kind).toBe("err");
    expect(validatePlanWeek(plan.weeks![1])).toBeNull();
  });

  test("validatePlanWeek blocks a progression the API would reject", () => {
    const w = (kind: "kg" | "percent" | "sets", amount: number) => ({ week: 2, directive: "base" as const, progression: { kind, amount } });
    expect(validatePlanWeek(w("kg", 2.5))).toBeNull();
    expect(validatePlanWeek(w("kg", 0))?.kind).toBe("err");
    expect(validatePlanWeek(w("kg", Number.NaN))?.kind).toBe("err");
    expect(validatePlanWeek(w("percent", 60))?.kind).toBe("err");
    expect(validatePlanWeek(w("sets", 1.5))?.kind).toBe("err");
    expect(validatePlanWeek(w("sets", -1))).toBeNull();
  });

  test("setProgression picks a default step and clears with an empty kind", () => {
    const w: PlanWeek = { week: 2, directive: "base" };
    setProgression(w, "kg");
    expect(w.progression).toEqual({ kind: "kg", amount: 2.5 });
    setProgression(w, "sets");
    expect(w.progression).toEqual({ kind: "sets", amount: 1 });
    setProgression(w, "");
    expect(w.progression).toBeUndefined();
  });

  test("normalizePlan renumbers weeks and trims names; defaultPlan ends with a deload", () => {
    const n = normalizePlan({ phase: " acc ", nextPhase: " ", plannedWeeks: 9, weeks: [{ week: 7, directive: "base" }] });
    expect(n).toEqual({ phase: "acc", nextPhase: null, plannedWeeks: 1, weeks: [{ week: 1, directive: "base" }] });
    const d = defaultPlan(4);
    expect(d.weeks!.map((w) => w.directive)).toEqual(["base", "+volume", "+volume", "deload"]);
    expect(d.weeks![3].target).toEqual({ metric: "overall_volume", deltaPercent: DELOAD_VOLUME_DELTA_PERCENT });
  });
});

describe("block plan helpers with a custom deload rule", () => {
  const custom = (p: Partial<DeloadSettings>): DeloadSettings => ({ ...DEFAULT_DELOAD, ...p });

  test("planIndexes dips load by the rule's load change", () => {
    const idx = planIndexes(plan, custom({ loadPercent: -20 })).map((x) => [Math.round(x.vol), +x.load.toFixed(1)]);
    expect(idx).toEqual([[100, 100], [105, 100], [105, 102.5], [63, 82]]);
    expect(planIndexes(plan, custom({ loadPercent: 0 }))[3].load).toBe(102.5);
  });

  test("planIndexes with the week-1 basis drops load to a share of week 1", () => {
    const idx = planIndexes(plan, custom({ loadPercent: -10, loadBasis: "week1" }));
    expect(idx[3].load).toBe(90);
    expect(idx[2].load).toBe(102.5);
  });

  test("defaultPlan's deload target follows the rule's volume cut", () => {
    const d = defaultPlan(5, custom({ setsKeptPercent: 60, loadPercent: 0 }));
    expect(d.weeks![4]).toEqual({ week: 5, directive: "deload", target: { metric: "overall_volume", deltaPercent: -40 } });
  });

  test("clientDeload falls back to the default; the legend phrase follows the rule", () => {
    expect(clientDeload(null)).toEqual(DEFAULT_DELOAD);
    expect(clientDeload({ effectiveDeload: custom({ amrap: true }) }).amrap).toBe(true);
    expect(deloadLoadPhrase()).toBe("a deload week drops load 10 %");
    expect(deloadLoadPhrase(custom({ loadPercent: -7.5 }))).toBe("a deload week drops load 7.5 %");
    expect(deloadLoadPhrase(custom({ loadPercent: 0 }))).toBe("a deload week keeps load");
    expect(deloadLoadPhrase(custom({ loadBasis: "week1", loadPercent: -15 }))).toBe("a deload week sets load to 85 % of week 1");
  });
});

describe("review checks, rationale, history", () => {
  const set = (rpe: number) => ({ setNumber: 1, type: "working" as const, reps: 5, amrap: false, targetRpe: rpe });
  /** One draft week (what the review checks read). */
  const draft = {
    name: "B",
    rationale: "",
    clientSummary: "",
    sessions: [
      { name: "Day 1", exercises: [{ exerciseId: "sq", exerciseName: "Squat", prescribedSets: [set(7), set(8)] }, { exerciseId: "row", exerciseName: "Row", prescribedSets: [set(8)] }] },
      { name: "Day 2", exercises: [{ exerciseId: "bench", exerciseName: "Bench", prescribedSets: [set(8), set(8)] }] },
    ],
  };
  const catalog = new Map([
    ["sq", { movementPattern: "knee_dominant" }],
    ["row", { movementPattern: "horizontal_pull" }],
    ["bench", { movementPattern: "horizontal_push" }],
  ]);

  test("reviewChecks", () => {
    expect(reviewChecks(draft, 3, catalog)).toEqual([
      { tone: "warn", text: "2 lifting sessions — the client lifts 3/week" },
      { tone: "info", text: "Highest prescribed effort: RPE 8" },
      { tone: "info", text: "5 working sets / week" },
      { tone: "warn", text: "Push 2 > pull 1 sets" },
      { tone: "info", text: "Knee 2 · hip 0 sets" },
    ]);
  });

  test("program header and draft review agree on the same week's balance (F21)", () => {
    const backoff = { ...set(7), type: "backoff" as const };
    const week = { ...draft, sessions: [...draft.sessions, { name: "Day 3", exercises: [{ exerciseId: "row", exerciseName: "Row", prescribedSets: [set(8), set(8), backoff] }] }] };
    const patternOf = (id: string) => catalog.get(id)?.movementPattern ?? null;
    const b = sessionsPatternBalance(week.sessions, patternOf);
    expect(formatPatternBalance(b)).toBe("8 sets — push 2 · pull 4 · knee 2");
    const texts = reviewChecks(week, null, catalog).map((c) => c.text);
    expect(texts).toContain(`Pull ${b.pull} ≥ push ${b.push} sets`);
    expect(texts).toContain(`Knee ${b.knee} · hip ${b.hip} sets`);
  });

  test("reviewChecks counts only lifting sessions against sessionsPerWeek", () => {
    const withCardio: typeof draft = { ...draft, sessions: [...draft.sessions, { name: "Bike", kind: "cardio", exercises: [] }] };
    expect(reviewChecks(withCardio, 2, catalog)[0]).toEqual({ tone: "ok", text: "2 lifting sessions — matches the client's 2/week" });
  });

  test("reviewChecks lists AI weekdays that break a placement rule (F03, F26)", () => {
    const priya: typeof draft = {
      ...draft,
      sessions: [
        { ...draft.sessions[0], name: "Heavy lower", weekday: 1, exercises: [{ exerciseId: "sq", prescribedSets: [set(7)] }] },
        { name: "Tempo run", kind: "cardio", weekday: 7, exercises: [], cardio: { modality: "Run", durationMin: 30, hrZone: 3, intensity: "tempo" } },
        { name: "Long run", kind: "cardio", weekday: 7, exercises: [], cardio: { modality: "Run", durationMin: 80, hrZone: 2 } },
      ],
    };
    const days = { trainingDays: [1, 2, 4, 5], cardioDays: [3, 7], longRunDay: 7 };
    const warns = reviewChecks(priya, null, catalog, days).filter((c) => c.tone === "warn").map((c) => c.text);
    expect(warns).toEqual([
      'Weekday conflict: "Tempo run" and "Long run" are both key runs on Sun — approval re-places it',
      'Weekday conflict: Heavy lower "Heavy lower" on Mon is the day after "Tempo run" — approval re-places it',
      'Weekday conflict: Heavy lower "Heavy lower" on Mon is the day after "Long run" — approval re-places it',
    ]);
    const fine = { ...priya, sessions: priya.sessions.map((s, i) => ({ ...s, weekday: [2, 5, 7][i] })) };
    expect(reviewChecks(fine, null, catalog, days).at(-1)).toEqual({ tone: "ok", text: "AI weekdays follow the client's schedule rules" });
    expect(reviewChecks(draft, null, catalog, days).some((c) => c.text.includes("weekday"))).toBe(false);
  });

  test("draftSessionTags numbers each track in draft order", () => {
    expect(draftSessionTags([{ kind: "lifting" }, { kind: "cardio" }, {}])).toEqual(["Session 1", "Cardio 1", "Session 2"]);
  });

  test("rationaleByDay resolves **Session N** / **Cardio N** leads by track", () => {
    const r = rationaleByDay("**Session 2:** bench.\n\n**Cardio 1:** easy bike.\n\n**Session 1:** squat.", 3, [{ kind: "lifting" }, { kind: "cardio" }, { kind: "lifting" }]);
    expect(r.days).toEqual([["Squat."], ["Easy bike."], ["Bench."]]);
    expect(r.general).toEqual([]);
  });

  test("rationaleByDay sends **Day N** blocks to their day", () => {
    const r = rationaleByDay("**Cold start** — no logs.\n\n**Day 1 — Squat:** back squat primary.\n\n**Day 2 — Upper:** bench.\n\n**Day 9:** ignored", 2);
    expect(r.days).toEqual([["Back squat primary."], ["Bench."]]);
    expect(r.general).toEqual(["**Cold start** — no logs.", "**Day 9:** ignored"]);
  });

  const named = [
    { kind: "lifting", name: "Lower — squat focus" },
    { kind: "lifting", name: "Upper — push & pull" },
    { kind: "lifting", name: "Full body — hinge focus" },
    { kind: "cardio", name: "Zone 2 bike" },
  ];

  test("rationaleByDay routes per-session bullets led by the session name", () => {
    const text = [
      "**Cold start, no data to lean on.** Beta has no logs.",
      "**Weekly structure — 3 lifting days, full-body with an emphasis each day.**\n- **Lower — squat focus (Mon):** back squat 3×6–8.\n- **Upper — push & pull (Wed):** bench press 3×6–8.\n- **Full body — hinge focus (Fri):** kettlebell swing 3×8.",
      "**Cardio.** 3 × 40 min Zone 2.",
    ].join("\n\n");
    const r = rationaleByDay(text, 4, named);
    expect(r.days).toEqual([["Back squat 3×6–8."], ["Bench press 3×6–8."], ["Kettlebell swing 3×8."], []]);
    expect(r.general).toEqual([
      "**Cold start, no data to lean on.** Beta has no logs.",
      "**Weekly structure — 3 lifting days, full-body with an emphasis each day.**",
      "**Cardio.** 3 × 40 min Zone 2.",
    ]);
  });

  test("rationaleByDay routes paragraphs led by the session name, case and dash agnostic", () => {
    const r = rationaleByDay("**Lower – Squat Focus** — squat 3×5.\n\n**Upper — push & pull:** bench.\n\n**Lower** — not a session name.", 4, named);
    expect(r.days).toEqual([["Squat 3×5."], ["Bench."], [], []]);
    expect(r.general).toEqual(["**Lower** — not a session name."]);
  });

  test("the prompt's sample session lead routes to that session", () => {
    const r = rationaleByDay(`**${RATIONALE_SESSION_LEAD_EXAMPLE}** — why.`, 1, [{ kind: "lifting", name: RATIONALE_SESSION_LEAD_EXAMPLE }]);
    expect(r.days).toEqual([["Why."]]);
  });

  test("historyEntries and ago", () => {
    const g = (id: string, msg: string | null, manual = false) => ({ id, revisionMessage: msg, manualEdit: manual }) as GenerationDto;
    const h = historyEntries([g("a", null), g("b", "swap squat"), g("c", "Block plan edited by you", true)]);
    expect(h.map((x) => [x.version, x.request, x.manual])).toEqual([[1, null, false], [2, "swap squat", false], [3, "Block plan edited by you", true]]);
    expect(ago("2026-11-06T09:26:00Z", Date.parse("2026-11-06T09:40:00Z"))).toBe("14 min ago");
  });
});
