import { expect, test } from "bun:test";
import type { AiProgramDraft, ChatProposal } from "./ai";
import { scopeToProposal } from "./scope";

const set = (reps: number, rest = 120, extra: Record<string, unknown> = {}) => ({
  setNumber: 1,
  type: "working" as const,
  reps,
  amrap: false,
  targetRpe: 7,
  restSeconds: rest,
  ...extra,
});
const ex = (name: string, sets = [set(5)]) => ({ exerciseName: name, prescribedSets: sets });

/** v1: D1 lifting, D2 lifting, D3 cardio (Z3), W4 deload −40 %. */
const parent = (): AiProgramDraft => ({
  name: "Block 1",
  rationale: "Why v1.",
  clientSummary: "Summary v1.",
  phasing: {
    plannedWeeks: 4,
    phase: "accumulation",
    nextPhase: "build",
    weeks: [
      { week: 1, directive: "base" },
      { week: 2, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 } },
      { week: 3, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 } },
      { week: 4, directive: "deload", target: { metric: "overall_volume", deltaPercent: -40 } },
    ],
  },
  sessions: [
    { name: "Lower A", kind: "lifting", exercises: [ex("Squat", [set(5, 180, { repsMin: 4 })]), ex("RDL"), ex("Plank")] },
    { name: "Upper A", kind: "lifting", exercises: [ex("Bench"), ex("Row"), ex("Curl")] },
    { name: "Tempo Ride", kind: "cardio", cardio: { modality: "Stationary Bike", durationMin: 30, hrZone: 3, targetRpe: 4 }, exercises: [] },
  ],
});

const proposal = (changes: ChatProposal["changes"]): ChatProposal => ({ summary: "s", changes });

test("keeps off-proposal cardio and phasing, takes the proposed slot", () => {
  const built = parent();
  built.name = "Block 1b";
  built.rationale = "Why v2.";
  built.sessions[0].exercises[1] = ex("RDL", [set(8, 90)]);
  built.sessions[0].exercises[0] = ex("Squat", [set(5, 180)]); // rep range 4–5 → 5, not asked
  built.sessions[2].cardio = { modality: "Bike", durationMin: 30, hrZone: 4, targetRpe: 3 };
  delete built.phasing!.weeks![3].target;
  built.phasing!.nextPhase = "deload";

  const { draft, discarded } = scopeToProposal(
    parent(),
    built,
    proposal([{ day: 1, slot: 2, kind: "edit", from: "RDL", to: "RDL", detail: "1×8 · rest 90s" }])
  );
  const want = parent();
  want.sessions[0].exercises[1] = ex("RDL", [set(8, 90)]);
  expect(draft.sessions).toEqual(want.sessions);
  expect(draft.phasing).toEqual(want.phasing);
  expect(draft.name).toBe("Block 1b");
  expect(draft.rationale).toStartWith("Why v2.");
  expect(draft.rationale).toEndWith("The AI also changed 4 things outside the proposal. Kept as before.");
  expect(discarded.map((c) => `${c.kind}:${c.day}:${c.exercise}`)).toEqual([
    "rx:1:Squat",
    "cardio:3:Tempo Ride",
    "plan:0:Next block",
    "plan:0:W4 target",
  ]);
});

test("remove + add on the same day keep the built order", () => {
  const built = parent();
  built.sessions[1].exercises = [ex("Row"), ex("Curl"), ex("Face Pull")];
  const { draft, discarded } = scopeToProposal(
    parent(),
    built,
    proposal([
      { day: 2, slot: 1, kind: "remove", from: "Bench", to: null, detail: "" },
      { day: 2, slot: null, kind: "add", from: null, to: "Face Pull", detail: "1×5" },
    ])
  );
  expect(draft.sessions[1].exercises.map((e) => e.exerciseName)).toEqual(["Row", "Curl", "Face Pull"]);
  expect(discarded).toEqual([]);
});

test("an unproposed add is dropped, a proposed add lands after its aligned predecessor", () => {
  const built = parent();
  built.sessions[1].exercises = [ex("Bench"), ex("Push-up"), ex("Row"), ex("Curl"), ex("Dip")];
  const { draft, discarded } = scopeToProposal(
    parent(),
    built,
    proposal([{ day: 2, slot: null, kind: "add", from: null, to: "Push-up", detail: "1×5" }])
  );
  expect(draft.sessions[1].exercises.map((e) => e.exerciseName)).toEqual(["Bench", "Push-up", "Row", "Curl"]);
  expect(discarded.map((c) => `${c.kind}:${c.exercise}`)).toEqual(["added:Dip"]);
});

test("a swap keeps the slot position; an unproposed swap reverts", () => {
  const built = parent();
  built.sessions[0].exercises[0] = ex("Front Squat");
  built.sessions[0].exercises[2] = ex("Dead Bug");
  const { draft, discarded } = scopeToProposal(
    parent(),
    built,
    proposal([{ day: 1, slot: 1, kind: "swap", from: "Squat", to: "Front Squat", detail: "1×5" }])
  );
  expect(draft.sessions[0].exercises.map((e) => e.exerciseName)).toEqual(["Front Squat", "RDL", "Plank"]);
  expect(discarded.map((c) => `${c.kind}:${c.from}→${c.to}`)).toEqual(["swap:Plank→Dead Bug"]);
});

test("off-proposal session renames and extra sessions are discarded", () => {
  const built = parent();
  built.sessions[0].name = "Legs";
  built.sessions.push({ name: "Extra", kind: "lifting", exercises: [ex("Lunge")] });
  const { draft, discarded } = scopeToProposal(parent(), built, proposal([{ day: 1, slot: 1, kind: "edit", from: "Squat", to: "Squat", detail: "" }]));
  expect(draft.sessions).toEqual(parent().sessions);
  expect(discarded.map((c) => `${c.kind}:${c.day}`)).toEqual(["session:1", "session:4", "added:4"]);
});

test("a built draft equal to parent + proposal has nothing to discard", () => {
  const built = parent();
  built.sessions[1].exercises[2] = ex("Hammer Curl");
  const { draft, discarded } = scopeToProposal(
    parent(),
    built,
    proposal([{ day: 2, slot: 3, kind: "swap", from: "Curl", to: "Hammer Curl", detail: "1×5" }])
  );
  expect(discarded).toEqual([]);
  expect(draft).toEqual(built);
});

test("a draft without phasing stays without phasing", () => {
  const p = parent();
  delete p.phasing;
  const built = structuredClone(p);
  built.phasing = { plannedWeeks: 2, phase: "x", weeks: [] };
  const { draft, discarded } = scopeToProposal(p, built, proposal([{ day: 1, slot: 1, kind: "edit", from: null, to: null, detail: "" }]));
  expect("phasing" in draft).toBe(false);
  expect(discarded.map((c) => c.kind)).toEqual(["plan"]);
});

test("a proposed cardio edit takes the built cardio prescription", () => {
  const built = parent();
  built.sessions[2].cardio = { modality: "Stationary Bike", durationMin: 40, hrZone: 3, targetRpe: 4 };
  const { draft, discarded } = scopeToProposal(
    parent(),
    built,
    proposal([{ day: 3, slot: null, kind: "edit", from: "Tempo Ride", to: "Tempo Ride", detail: "40 min · Z3" }])
  );
  expect(draft.sessions[2].cardio!.durationMin).toBe(40);
  expect(discarded).toEqual([]);
});

// ---- free-text revisions: phasing lock (plan §D) ----

import { lockPhasing, mentionsPlan } from "./scope";

test("mentionsPlan: block plan words count, exercise talk does not", () => {
  for (const m of [
    "Make week 4 a deload",
    "Drop the W4 target",
    "Lengthen the block plan to 6 weeks",
    "Change the phase to intensification",
    "Rework the phasing",
    "periodise this as undulating",
    "Next block should be a peak",
    "add a taper",
  ]) expect([m, mentionsPlan(m)]).toEqual([m, true]);
  for (const m of [
    "Swap back squat for front squat",
    "More rest on the bench",
    "Make the tempo ride zone 2",
    "Add a block pull",
    "This week felt heavy, lower the RPE",
    "Explain the plank",
  ]) expect([m, mentionsPlan(m)]).toEqual([m, false]);
});

test("lockPhasing keeps the parent's plan unless the message is about it", () => {
  const p = parent();
  const revised = parent();
  revised.sessions[0].exercises[0] = ex("Front Squat");
  delete revised.phasing!.weeks![3].target;
  const locked = lockPhasing(p, revised, "Swap the squat");
  expect(locked.draft.phasing).toEqual(p.phasing);
  expect(locked.draft.sessions).toEqual(revised.sessions);
  expect(locked.discarded.map((c) => c.exercise)).toEqual(["W4 target"]);
  const asked = lockPhasing(p, revised, "Drop the week 4 target");
  expect(asked.draft.phasing).toEqual(revised.phasing);
  expect(asked.discarded).toEqual([]);
  const noPlan = structuredClone(p);
  delete noPlan.phasing;
  expect("phasing" in lockPhasing(noPlan, revised, "Swap the squat").draft).toBe(false);
});
