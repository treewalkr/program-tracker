import { expect, test } from "bun:test";
import { diffDraftSlots, rxLabel, unproposedChanges, type SlotDiffDraft } from "./slots";

const set = (reps: number, rpe: number, rest: number) => ({ reps, targetRpe: rpe, restSeconds: rest });
const ex = (name: string, sets = [set(5, 7, 120)]) => ({ exerciseName: name, prescribedSets: sets });
const draft = (...days: ReturnType<typeof ex>[][]): SlotDiffDraft => ({ sessions: days.map((exercises, i) => ({ name: `Day ${i + 1}`, exercises })) });

test("rxLabel", () => {
  expect(rxLabel([set(5, 7, 180), set(5, 8, 180)])).toBe("2×5 @RPE 7–8 · rest 180s");
  expect(rxLabel([{ reps: 0, durationSeconds: 45, targetRpe: 7, restSeconds: 60 }])).toBe("1×45s @RPE 7 · rest 60s");
});

test("diffDraftSlots covers swap, rx, added, removed", () => {
  const before = draft([ex("Squat"), ex("RDL"), ex("Plank")], [ex("Bench"), ex("Row")]);
  const after = draft([ex("Paused Squat"), ex("RDL", [set(5, 7, 150)]), ex("Plank")], [ex("Bench"), ex("Row"), ex("Face Pull")]);
  expect(diffDraftSlots(before, after)).toEqual([
    { day: 1, beforeSlot: 1, afterSlot: 1, kind: "swap", exercise: "Paused Squat", from: "Squat", to: "Paused Squat" },
    { day: 1, beforeSlot: 2, afterSlot: 2, kind: "rx", exercise: "RDL", from: "rest 120s", to: "rest 150s" },
    { day: 2, beforeSlot: null, afterSlot: 3, kind: "added", exercise: "Face Pull", from: null, to: "1×5 @RPE 7 · rest 120s" },
  ]);
  const removed = diffDraftSlots(draft([ex("A"), ex("B"), ex("C")]), draft([ex("A"), ex("C")]));
  expect(removed).toEqual([{ day: 1, beforeSlot: 2, afterSlot: null, kind: "removed", exercise: "B", from: "1×5 @RPE 7 · rest 120s", to: null }]);
});

test("unproposedChanges", () => {
  const before = draft([ex("Squat"), ex("RDL")]);
  const after = draft([ex("Paused Squat"), ex("RDL", [set(5, 7, 150)])]);
  const extra = unproposedChanges(diffDraftSlots(before, after), { changes: [{ day: 1, slot: 1, kind: "swap" }] });
  expect(extra.map((c) => c.exercise)).toEqual(["RDL"]);
});

// ---- F04: the full diff (docs/exact-revisions-plan.md §A) ----

import { diffDrafts, planChanges, rxParts } from "./slots";

const phasing = (w4Target: boolean, nextPhase: string | null = "build") => ({
  plannedWeeks: 4,
  phase: "accumulation",
  nextPhase,
  weeks: [
    { week: 1, directive: "base" as const },
    { week: 2, directive: "+volume" as const, target: { metric: "overall_volume" as const, deltaPercent: 5 } },
    { week: 3, directive: "+volume" as const, target: { metric: "overall_volume" as const, deltaPercent: 5 } },
    w4Target
      ? { week: 4, directive: "deload" as const, target: { metric: "overall_volume" as const, deltaPercent: -40 } }
      : { week: 4, directive: "deload" as const },
  ],
});
const lift = (name: string, exercises: ReturnType<typeof ex>[]) => ({ name, kind: "lifting" as const, exercises });
const cardio = (name: string, rx: Record<string, unknown>) => ({ name, kind: "cardio" as const, cardio: { modality: "Stationary Bike", durationMin: 30, hrZone: 3, targetRpe: 4, ...rx }, exercises: [] });
const ranged = (repsMin: number, reps: number, extra: Record<string, unknown> = {}) => ({ reps, repsMin, targetRpe: 8, restSeconds: 180, ...extra });

const v1 = (): SlotDiffDraft => ({
  phasing: phasing(true),
  sessions: [
    lift("Lower A", [ex("Squat", [ranged(4, 5), ranged(4, 5), ranged(4, 5)]), ex("RDL")]),
    cardio("Tempo Ride", {}),
  ],
});

test("rxParts renders rep ranges, loads and back-off sets", () => {
  expect(rxParts([ranged(4, 5), ranged(4, 5), ranged(4, 5)]).volume).toBe("3×4–5");
  expect(rxParts([ranged(5, 5)]).volume).toBe("1×5");
  expect(rxParts([{ reps: 5, targetWeightKg: 100 }]).load).toBe("100 kg");
  expect(rxParts([{ reps: 5, targetWeightKg: 95 }, { reps: 5, targetWeightKg: 100 }]).load).toBe("95–100 kg");
  expect(rxParts([{ reps: 5 }]).load).toBeNull();
  expect(rxParts([{ reps: 3 }, { reps: 3 }, { reps: 8, type: "backoff" }]).volume).toBe("2×3 + 1×8 back-off");
  expect(rxLabel([{ reps: 5, targetWeightKg: 100, targetRpe: 8, restSeconds: 180 }])).toBe("1×5 @RPE 8 · 100 kg · rest 180s");
});

test("F04: rep range 4–5 → 5 is an rx change", () => {
  const after = v1();
  after.sessions[0].exercises[0] = ex("Squat", [ranged(5, 5), ranged(5, 5), ranged(5, 5)]);
  expect(diffDrafts(v1(), after)).toEqual([
    { day: 1, beforeSlot: 1, afterSlot: 1, kind: "rx", exercise: "Squat", from: "3×4–5", to: "3×5" },
  ]);
});

test("load and set type changes are rx changes", () => {
  const before = draft([ex("Bench", [{ reps: 5, targetWeightKg: 80 }, { reps: 5, targetWeightKg: 80 }])]);
  const heavier = draft([ex("Bench", [{ reps: 5, targetWeightKg: 85 }, { reps: 5, targetWeightKg: 85 }])]);
  expect(diffDrafts(before, heavier).map((c) => [c.kind, c.from, c.to])).toEqual([["rx", "80 kg", "85 kg"]]);
  const backoff = draft([ex("Bench", [{ reps: 5, targetWeightKg: 80 }, { reps: 5, targetWeightKg: 80, type: "backoff" }])]);
  expect(diffDrafts(before, backoff).map((c) => [c.kind, c.from, c.to])).toEqual([["rx", "2×5", "1×5 + 1×5 back-off"]]);
});

test("F04: cardio zone, RPE and modality changes surface", () => {
  const after = v1();
  after.sessions[1] = cardio("Tempo Ride", { modality: "Bike", hrZone: 4, targetRpe: 3 });
  expect(diffDrafts(v1(), after)).toEqual([
    {
      day: 2,
      beforeSlot: null,
      afterSlot: null,
      kind: "cardio",
      exercise: "Tempo Ride",
      from: "Stationary Bike, Z3, RPE 4",
      to: "Bike, Z4, RPE 3",
    },
  ]);
});

test("session rename and kind/type changes surface", () => {
  const after = v1();
  after.sessions[0] = { ...after.sessions[0], name: "Lower B", type: "Strength" } as (typeof after.sessions)[number];
  expect(diffDrafts(v1(), after)).toEqual([
    { day: 1, beforeSlot: null, afterSlot: null, kind: "session", exercise: "Lower B", from: "Lower A, no type", to: "Lower B, Strength" },
  ]);
});

test("added and removed sessions surface as session changes", () => {
  const before = v1();
  const after = v1();
  after.sessions.pop();
  expect(diffDrafts(before, after)).toEqual([
    { day: 2, beforeSlot: null, afterSlot: null, kind: "session", exercise: "Tempo Ride", from: "Tempo Ride", to: "removed" },
  ]);
  expect(diffDrafts(after, before)).toEqual([
    { day: 2, beforeSlot: null, afterSlot: null, kind: "session", exercise: "Tempo Ride", from: null, to: "added · Tempo Ride" },
  ]);
});

test("F04: phasing — W4 deload target dropped, next block build → deload", () => {
  const after = v1();
  after.phasing = phasing(false, "deload");
  expect(diffDrafts(v1(), after)).toEqual([
    { day: 0, week: null, beforeSlot: null, afterSlot: null, kind: "plan", exercise: "Next block", from: "build", to: "deload" },
    { day: 0, week: 4, beforeSlot: null, afterSlot: null, kind: "plan", exercise: "W4 target", from: "-40% volume", to: "no target" },
  ]);
});

test("planChanges lives in shared", () => {
  expect(planChanges(phasing(true), phasing(false))).toEqual([{ week: 4, where: "W4 target", from: "-40% volume", to: "no target" }]);
});

test("F04: an exercise-only proposal covers none of the off-proposal changes", () => {
  const after = v1();
  after.phasing = phasing(false, "deload");
  after.sessions[0].exercises[0] = ex("Squat", [ranged(5, 5), ranged(5, 5), ranged(5, 5)]);
  after.sessions[0].exercises[1] = ex("RDL", [set(5, 7, 150)]);
  after.sessions[0].name = "Lower B";
  after.sessions[1] = cardio("Tempo Ride", { modality: "Bike", hrZone: 4, targetRpe: 3 });
  const extra = unproposedChanges(diffDrafts(v1(), after), { changes: [{ day: 1, slot: 2, kind: "edit" }] });
  expect(extra.map((c) => c.kind).sort()).toEqual(["cardio", "plan", "plan", "rx", "session"]);
});

test("a cardio edit (slot null) covers that day's cardio change only", () => {
  const after = v1();
  after.sessions[1] = cardio("Tempo Ride", { durationMin: 40 });
  after.phasing = phasing(false);
  const extra = unproposedChanges(diffDrafts(v1(), after), { changes: [{ day: 2, slot: null, kind: "edit" }] });
  expect(extra.map((c) => c.kind)).toEqual(["plan"]);
  const wrongDay = unproposedChanges(diffDrafts(v1(), after), { changes: [{ day: 1, slot: null, kind: "edit" }] });
  expect(wrongDay.map((c) => c.kind)).toEqual(["cardio", "plan"]);
});

// ---- F22/F23: the prescription model in the diff ----

test("rxParts and rxLabel carry %1RM, RPE ranges, RIR, tempo and stop RPE", () => {
  const p = rxParts([
    { reps: 5, percent1rm: 75, targetRpeMin: 7, targetRpe: 8, targetRir: 2, tempo: "3-1-1-0" },
    { reps: 5, percent1rm: 80, targetRpeMin: 7, targetRpe: 8, targetRir: 2, tempo: "3-1-1-0" },
  ]);
  expect([p.pct, p.rpe, p.rir, p.tempo, p.stop]).toEqual(["75–80% 1RM", "RPE 7–8", "RIR 2", "tempo 3-1-1-0", null]);
  expect(rxParts([{ reps: 5, targetRpeMin: 7, targetRpe: 8 }, { reps: 5, targetRpeMin: 8, targetRpe: 9 }]).rpe).toBe("RPE 7–8/8–9");
  expect(rxLabel([{ reps: 0, amrap: true, stopRpe: 9, targetWeightKg: 90 }])).toBe("1×0+ · stop @ RPE 9 · 90 kg");
  expect(rxLabel([{ reps: 5, percent1rm: 75, targetRir: 2, tempo: "31X0", restSeconds: 120 }])).toBe("1×5 · RIR 2 · 75% 1RM · tempo 31X0 · rest 120s");
});

test("an RPE range is not the same as a ramp of single RPEs", () => {
  const ramp = [{ reps: 5, targetRpe: 7 }, { reps: 5, targetRpe: 8 }];
  const range = [{ reps: 5, targetRpeMin: 7, targetRpe: 8 }, { reps: 5, targetRpeMin: 7, targetRpe: 8 }];
  const d = (sets: object[]) => ({ sessions: [lift("Lower A", [ex("Squat", sets as never)])] });
  expect(diffDrafts(d(ramp), d(range))).toEqual([
    { day: 1, beforeSlot: 1, afterSlot: 1, kind: "rx", exercise: "Squat", from: "RPE 7–8 ramp", to: "RPE 7–8 range" },
  ]);
});

test("diffDrafts sees tempo, %1RM, RIR and stop-RPE edits", () => {
  const d = (extra: Record<string, unknown>) => ({ sessions: [lift("Lower A", [ex("Squat", [{ reps: 5, amrap: true, ...extra }])])] });
  const rx = (a: Record<string, unknown>, b: Record<string, unknown>) => diffDrafts(d(a), d(b)).map((c) => [c.from, c.to]);
  expect(rx({ tempo: "3-1-1-0" }, { tempo: "2-0-1-0" })).toEqual([["tempo 3-1-1-0", "tempo 2-0-1-0"]]);
  expect(rx({ percent1rm: 75 }, { percent1rm: 77.5 })).toEqual([["75% 1RM", "77.5% 1RM"]]);
  expect(rx({}, { targetRir: 2 })).toEqual([["no rir", "RIR 2"]]);
  expect(rx({ stopRpe: 9 }, { stopRpe: 8 })).toEqual([["stop @ RPE 9", "stop @ RPE 8"]]);
});

test("planChanges sees a week's progression rule", () => {
  const a = { plannedWeeks: 2, phase: "acc", weeks: [{ week: 1, directive: "base" }, { week: 2, directive: "+intensity" }] };
  const b = { ...a, weeks: [a.weeks[0], { ...a.weeks[1], progression: { kind: "kg", amount: 2.5 } }] };
  expect(planChanges(a, b)).toEqual([{ week: 2, where: "W2 progression", from: "no progression", to: "+2.5 kg" }]);
});
