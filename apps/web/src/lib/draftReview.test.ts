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
  weekTargetLabel,
} from "./draftReview";
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
    expect(idx).toEqual([[100, 100], [105, 100], [105, 102.5], [63, 102.5]]);
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

  test("normalizePlan renumbers weeks and trims names; defaultPlan ends with a deload", () => {
    const n = normalizePlan({ phase: " acc ", nextPhase: " ", plannedWeeks: 9, weeks: [{ week: 7, directive: "base" }] });
    expect(n).toEqual({ phase: "acc", nextPhase: null, plannedWeeks: 1, weeks: [{ week: 1, directive: "base" }] });
    const d = defaultPlan(4);
    expect(d.weeks!.map((w) => w.directive)).toEqual(["base", "+volume", "+volume", "deload"]);
  });
});

describe("review checks, rationale, history", () => {
  const set = (rpe: number) => ({ setNumber: 1, type: "working" as const, reps: 5, amrap: false, targetRpe: rpe });
  const draft: AiDraftDto = {
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

  test("reviewChecks counts only lifting sessions against sessionsPerWeek", () => {
    const withCardio: AiDraftDto = { ...draft, sessions: [...draft.sessions, { name: "Bike", kind: "cardio", exercises: [] }] };
    expect(reviewChecks(withCardio, 2, catalog)[0]).toEqual({ tone: "ok", text: "2 lifting sessions — matches the client's 2/week" });
  });

  test("reviewChecks lists AI weekdays that break a placement rule (F03, F26)", () => {
    const priya: AiDraftDto = {
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
    const r = rationaleByDay("**Session 2:** bench.\n\n**Cardio 1:** easy bike.\n\n**Session 1:** squat.", 3, ["lifting", "cardio", "lifting"]);
    expect(r.days).toEqual([["Squat."], ["Easy bike."], ["Bench."]]);
    expect(r.general).toEqual([]);
  });

  test("rationaleByDay sends **Day N** blocks to their day", () => {
    const r = rationaleByDay("**Cold start** — no logs.\n\n**Day 1 — Squat:** back squat primary.\n\n**Day 2 — Upper:** bench.\n\n**Day 9:** ignored", 2);
    expect(r.days).toEqual([["Back squat primary."], ["Bench."]]);
    expect(r.general).toEqual(["**Cold start** — no logs.", "**Day 9:** ignored"]);
  });

  test("historyEntries and ago", () => {
    const g = (id: string, msg: string | null, manual = false) => ({ id, revisionMessage: msg, manualEdit: manual }) as GenerationDto;
    const h = historyEntries([g("a", null), g("b", "swap squat"), g("c", "Block plan edited by you", true)]);
    expect(h.map((x) => [x.version, x.request, x.manual])).toEqual([[1, null, false], [2, "swap squat", false], [3, "Block plan edited by you", true]]);
    expect(ago("2026-11-06T09:26:00Z", Date.parse("2026-11-06T09:40:00Z"))).toBe("14 min ago");
  });
});
