import { describe, expect, test } from "bun:test";
import type { PortalSession } from "@pt/shared";
import { EMPTY_READINESS, setFlagNote, toggleFlag } from "$lib/logFlags";
import { setSkipReason, skipExercise } from "$lib/logSheet";
import { buildPortalLog, cardioFormOf, extraRow, formOfSession, parsePortalDraft, portalDraftJson, rowsOfSession, sameForm, touchedExercises, type PortalLogForm } from "./logForm";

const lifting: PortalSession = {
  id: "ps1", name: "Lower", kind: "lifting", seq: 1, weekday: 1, order: 0, cardio: null, log: null,
  exercises: [
    {
      id: "pe1", exerciseId: "ex-squat", exerciseName: "Back Squat", order: 0,
      prescribedSets: [
        { setNumber: 1, type: "working", reps: 8, repsMin: 6, amrap: false, targetWeightKg: 100, targetRpe: 8 },
        { setNumber: 2, type: "working", reps: 8, repsMin: 6, amrap: false, targetWeightKg: 100, targetRpe: 8 },
      ],
    },
    { id: "pe2", exerciseId: "ex-plank", exerciseName: "Plank", order: 1, prescribedSets: [{ setNumber: 1, type: "working", reps: 0, amrap: false, durationSeconds: 45, targetWeightKg: null }] },
  ],
};
const cardio: PortalSession = { ...lifting, id: "ps2", kind: "cardio", exercises: [], cardio: { modality: "Run", durationMin: 30, hrZone: 2 } };

const form = (s: PortalSession, over: Partial<PortalLogForm> = {}): PortalLogForm => ({
  rows: rowsOfSession(s), cardio: cardioFormOf(s.cardio), readiness: { ...EMPTY_READINESS }, notes: "", date: "2026-11-16", flags: {}, ...over,
});

const noTarget: PortalSession = {
  ...lifting,
  id: "ps3",
  exercises: [
    {
      id: "pe3", exerciseId: "ex-pulldown", exerciseName: "Lat Pulldown", order: 0,
      prescribedSets: [
        { setNumber: 1, type: "working", reps: 10, amrap: false, targetWeightKg: null, lastWeightKg: 55 },
        { setNumber: 2, type: "working", reps: 10, amrap: false, targetWeightKg: null, lastWeightKg: null },
      ],
    },
    { id: "pe4", exerciseId: "ex-chin", exerciseName: "Chin-up", order: 1, bodyweight: true, prescribedSets: [{ setNumber: 1, type: "working", reps: 6, amrap: false, targetWeightKg: null }] },
  ],
};

describe("portal log form", () => {
  test("no target kg: prefills the client's last load; never on a bodyweight move", () => {
    const rows = rowsOfSession(noTarget);
    expect(rows.map((r) => [r.key, r.weight])).toEqual([
      ["pe3:1", 55],
      ["pe3:2", ""],
      ["pe4:1", ""],
    ]);
  });

  test("a weighted set with no kg can't be saved; bodyweight and timed sets can", () => {
    expect(buildPortalLog(noTarget, form(noTarget), false)).toEqual({ error: "kg", sets: 1, programExerciseId: "pe3" });
    const f = form(noTarget);
    f.rows[1].weight = 0;
    expect(buildPortalLog(noTarget, f, false)).toMatchObject({ sets: 3 });
    // the plank in `lifting` is timed: no kg needed
    expect(buildPortalLog(lifting, form(lifting), false)).toMatchObject({ sets: 3 });
    // …even from an old draft whose rows don't say `timed`
    const old = form(lifting);
    old.rows = old.rows.map(({ timed: _t, ...r }) => r as typeof r & { timed: boolean });
    expect(buildPortalLog(lifting, old, false)).toMatchObject({ sets: 3 });
    // and bodyweight stays exempt at 0 or blank
    const bw = form(noTarget);
    bw.rows[1].weight = 0;
    bw.rows[2].weight = 0;
    expect(buildPortalLog(noTarget, bw, false)).toMatchObject({ sets: 3 });
  });

  test("rows come prefilled as prescribed: range bottom and kg, never RPE; timed sets log their seconds", () => {
    const rows = rowsOfSession(lifting);
    expect(rows.map((r) => [r.key, r.weight, r.reps, r.rpe])).toEqual([
      ["pe1:1", 100, 6, ""],
      ["pe1:2", 100, 6, ""],
      ["pe2:1", "", 45, ""],
    ]);
  });

  test("a one-tap save marks untouched sets as planned and sends no RPE", () => {
    const r = buildPortalLog(lifting, form(lifting), false);
    if (!("input" in r)) throw new Error("expected input");
    expect(r.input.sets.map((s) => [s.setNumber, s.reps, s.rpe, s.asPlanned])).toEqual([
      [1, 6, undefined, true],
      [2, 6, undefined, true],
      [1, 45, undefined, true],
    ]);
    expect(r.input.sets.every((s) => !("rpe" in s) || s.rpe === undefined)).toBe(true);
  });

  test("an edited kg, reps or an RPE the client gave confirms the set", () => {
    const f = form(lifting);
    f.rows[0].rpe = 8.5;
    f.rows[1].weight = 102.5;
    const r = buildPortalLog(lifting, f, false);
    if (!("input" in r)) throw new Error("expected input");
    expect(r.input.sets.map((s) => [s.setNumber, s.rpe, s.asPlanned ?? false])).toEqual([
      [1, 8.5, false],
      [2, undefined, false],
      [1, undefined, true],
    ]);
  });

  test("cardio RPE is saved only when the client gave it", () => {
    const withTarget: PortalSession = { ...cardio, cardio: { modality: "Run", durationMin: 30, targetRpe: 6 } };
    expect(cardioFormOf(withTarget.cardio).rpe).toBe("");
    const r = buildPortalLog(withTarget, form(withTarget), false);
    if (!("input" in r)) throw new Error("expected input");
    expect(r.input.cardio?.rpe).toBeUndefined();
  });

  test("as prescribed is one save; edits go through", () => {
    const f = form(lifting);
    f.rows[1].reps = 5;
    const r = buildPortalLog(lifting, f, false);
    if (!("input" in r)) throw new Error("expected input");
    expect(r.sets).toBe(3);
    expect(r.input.sets.map((s) => [s.programExerciseId, s.weightKg, s.reps, s.rpe])).toEqual([
      ["pe1", 100, 6, undefined],
      ["pe1", 100, 5, undefined],
      ["pe2", undefined, 45, undefined],
    ]);
    expect(r.input).not.toHaveProperty("onDuplicate");
    expect(buildPortalLog(lifting, f, true)).toMatchObject({ input: { onDuplicate: "replace" } });
  });

  test("nothing entered, or cardio with no activity, can't be saved", () => {
    const empty = form(lifting, { rows: rowsOfSession(lifting).map((r) => ({ ...r, weight: "", reps: "" })) });
    expect(buildPortalLog(lifting, empty, false)).toEqual({ error: "nothing" });
    expect(buildPortalLog(cardio, form(cardio, { cardio: { ...cardioFormOf(null) } }), false)).toEqual({ error: "activity" });
    const ok = buildPortalLog(cardio, form(cardio, { readiness: { energy: 7, sleep: 4, soreness: null }, notes: " good " }), false);
    expect(ok).toMatchObject({ input: { kind: "cardio", cardio: { modality: "Run", durationMin: 30, hrZone: 2 }, perceivedEnergy: 7, readiness: { sleep: 4 }, notes: "good", sets: [] } });
  });

  test("a draft round-trips, and one that no longer fits the session is dropped", () => {
    const f = form(lifting, { notes: "knee ok", readiness: { energy: 6, sleep: null, soreness: 2 } });
    const back = parsePortalDraft(portalDraftJson(f), rowsOfSession(lifting));
    expect(back).toMatchObject({ notes: "knee ok", readiness: { energy: 6, sleep: null, soreness: 2 }, date: "2026-11-16" });
    expect(parsePortalDraft(portalDraftJson(f), rowsOfSession({ ...lifting, exercises: lifting.exercises.slice(0, 1) }))).toBeNull();
    expect(parsePortalDraft("{junk", rowsOfSession(lifting))).toBeNull();
  });

  test("an untouched prefill is the same form; any edit is not", () => {
    expect(sameForm(form(lifting), form(lifting))).toBe(true);
    expect(sameForm(form(lifting), form(lifting, { notes: "  " }))).toBe(true);
    const f = form(lifting);
    f.rows[0].reps = 7;
    expect(sameForm(form(lifting), f)).toBe(false);
    expect(sameForm(form(lifting), form(lifting, { readiness: { energy: 5, sleep: null, soreness: null } }))).toBe(false);
  });

  test("touched exercises: a changed cell or an extra set marks its exercise", () => {
    const pristine = rowsOfSession(lifting);
    expect(touchedExercises(pristine, rowsOfSession(lifting)).size).toBe(0);
    const rows = rowsOfSession(lifting);
    rows[1].weight = 102.5;
    expect([...touchedExercises(pristine, rows)]).toEqual(["pe1"]);
    const more = [...rowsOfSession(lifting), extraRow(rowsOfSession(lifting)[2], 2)];
    expect([...touchedExercises(pristine, more)]).toEqual(["pe2"]);
  });
});

describe("edit log: the client's own entry reopens", () => {
  const entry = (sets: { pe: string; ex: string; n: number; kg: number | null; reps: number; rpe?: number; planned?: boolean }[]) => ({
    sets: sets.map((s) => ({ programExerciseId: s.pe, exerciseId: s.ex, setNumber: s.n, type: "working" as const, weightKg: s.kg, reps: s.reps, rpe: s.rpe ?? null, asPlanned: s.planned ?? false })),
    cardio: null,
    notes: "knee ok",
    perceivedEnergy: 6,
    readiness: { sleep: 2 },
    flags: null,
  });

  test("no entry (a coach's log, or none): the prescription", () => {
    expect(formOfSession(lifting, "2026-11-16").rows).toEqual(rowsOfSession(lifting));
    const coach = { ...lifting, log: { id: "l1", loggedBy: "trainer" as const, date: "2026-11-15" } };
    expect(formOfSession(coach, "2026-11-16")).toMatchObject({ notes: "", date: "2026-11-16" });
  });

  test("saved values fill the rows; a set not saved reopens missed; extra sets come back", () => {
    const s: PortalSession = {
      ...lifting,
      log: {
        id: "l1", loggedBy: "client", date: "2026-11-15",
        entry: entry([
          { pe: "pe1", ex: "ex-squat", n: 1, kg: 102.5, reps: 7, rpe: 8.5 },
          { pe: "pe1", ex: "ex-squat", n: 3, kg: 100, reps: 5 },
          { pe: "pe2", ex: "ex-plank", n: 1, kg: null, reps: 45, planned: true },
        ]),
      },
    };
    const f = formOfSession(s, "2026-11-16");
    expect(f.rows.map((r) => [r.key, r.weight, r.reps, r.rpe, r.skipped ?? false, r.extra ?? false])).toEqual([
      ["pe1:1", 102.5, 7, 8.5, false, false],
      ["pe1:2", 100, 6, "", true, false],
      ["pe1:x3", 100, 5, "", false, true],
      ["pe2:1", "", 45, "", false, false],
    ]);
    expect(f).toMatchObject({ notes: "knee ok", date: "2026-11-15", readiness: { energy: 6, sleep: 2, soreness: null } });
    // re-saving untouched keeps what was planned as planned, and what was confirmed as confirmed
    const r = buildPortalLog(s, f, true);
    if (!("input" in r)) throw new Error("expected input");
    expect(r.input.sets.map((x) => [x.setNumber, x.weightKg, x.reps, x.rpe, x.asPlanned ?? false])).toEqual([
      [1, 102.5, 7, 8.5, false],
      [3, 100, 5, undefined, false],
      [1, undefined, 45, undefined, true],
    ]);
  });

  test("a saved cardio entry reopens its numbers", () => {
    const s: PortalSession = {
      ...cardio,
      log: { id: "l2", loggedBy: "client", date: "2026-11-15", entry: { ...entry([]), cardio: { modality: "Bike", durationMin: 40, rpe: 6 } } },
    };
    expect(formOfSession(s, "2026-11-16").cardio).toEqual({ modality: "Bike", durationMin: "40", hrZone: "", intensity: "", distanceKm: "", rpe: "6" });
  });
});

describe("skip, something hurt, missed set", () => {
  test("pain on an exercise and a skipped exercise go out as flags, in the trainer's vocabulary", () => {
    const f = form(lifting);
    f.flags = toggleFlag({}, "pe1", "pain");
    f.flags = setFlagNote(f.flags, "pe1", " left knee ");
    f.rows = setSkipReason(skipExercise(f.rows, "pe2"), "pe2", "time");
    const r = buildPortalLog(lifting, f, false);
    if (!("input" in r)) throw new Error("expected input");
    expect(r.input.flags).toEqual([
      { programExerciseId: "pe1", exerciseId: "ex-squat", kind: "pain", note: "left knee" },
      { programExerciseId: "pe2", exerciseId: "ex-plank", kind: "skipped", reason: "time" },
    ]);
    // the skipped plank sends no sets
    expect(r.input.sets.map((s) => s.programExerciseId)).toEqual(["pe1", "pe1"]);
  });

  test("no flags: none sent", () => {
    const r = buildPortalLog(lifting, form(lifting), false);
    expect(r).not.toHaveProperty("input.flags");
  });

  test("a missed set is not sent, unlike 0 reps", () => {
    const f = form(lifting);
    f.rows[1] = { ...f.rows[1], skipped: true };
    f.rows[2] = { ...f.rows[2], reps: 0 };
    const r = buildPortalLog(lifting, f, false);
    if (!("input" in r)) throw new Error("expected input");
    expect(r.input.sets.map((s) => [s.programExerciseId, s.setNumber, s.reps])).toEqual([
      ["pe1", 1, 6],
      ["pe2", 1, 0],
    ]);
  });

  test("marking a set missed or flagging pain is an edit; both survive a draft", () => {
    const f = form(lifting);
    f.rows[0] = { ...f.rows[0], skipped: true };
    expect(sameForm(form(lifting), f)).toBe(false);
    const g = form(lifting, { flags: toggleFlag({}, "pe1", "pain") });
    expect(sameForm(form(lifting), g)).toBe(false);
    const back = parsePortalDraft(portalDraftJson({ ...g, rows: f.rows }), rowsOfSession(lifting));
    expect(back?.flags).toEqual({ pe1: { kind: "pain", note: "" } });
    expect(back?.rows[0].skipped).toBe(true);
  });

  test("a saved entry reopens its pain flag and its skipped exercise", () => {
    const s: PortalSession = {
      ...lifting,
      log: {
        id: "l1", loggedBy: "client", date: "2026-11-15",
        entry: {
          sets: [{ programExerciseId: "pe1", exerciseId: "ex-squat", setNumber: 1, type: "working", weightKg: 100, reps: 6, rpe: null, asPlanned: false }],
          cardio: null, notes: null, perceivedEnergy: null, readiness: null,
          flags: [
            { programExerciseId: "pe1", exerciseId: "ex-squat", kind: "pain", note: "knee" },
            { programExerciseId: "pe2", exerciseId: "ex-plank", kind: "skipped", reason: "equipment" },
          ],
        },
      },
    };
    const f = formOfSession(s, "2026-11-16");
    expect(f.flags).toEqual({ pe1: { kind: "pain", note: "knee" } });
    expect(f.rows.find((r) => r.programExerciseId === "pe2")?.exerciseSkip).toEqual({ reason: "equipment" });
  });
});
