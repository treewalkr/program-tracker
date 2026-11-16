import { describe, expect, test } from "bun:test";
import type { PortalSession } from "@pt/shared";
import { EMPTY_READINESS } from "$lib/logFlags";
import { buildPortalLog, cardioFormOf, extraRow, parsePortalDraft, portalDraftJson, rowsOfSession, sameForm, touchedExercises, type PortalLogForm } from "./logForm";

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
  rows: rowsOfSession(s), cardio: cardioFormOf(s.cardio), readiness: { ...EMPTY_READINESS }, notes: "", date: "2026-11-16", ...over,
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
  });

  test("rows come prefilled as prescribed: range bottom, kg, RPE; timed sets log their seconds", () => {
    const rows = rowsOfSession(lifting);
    expect(rows.map((r) => [r.key, r.weight, r.reps, r.rpe])).toEqual([
      ["pe1:1", 100, 6, 8],
      ["pe1:2", 100, 6, 8],
      ["pe2:1", "", 45, ""],
    ]);
  });

  test("as prescribed is one save; edits go through", () => {
    const f = form(lifting);
    f.rows[1].reps = 5;
    const r = buildPortalLog(lifting, f, false);
    if (!("input" in r)) throw new Error("expected input");
    expect(r.sets).toBe(3);
    expect(r.input.sets.map((s) => [s.programExerciseId, s.weightKg, s.reps, s.rpe])).toEqual([
      ["pe1", 100, 6, 8],
      ["pe1", 100, 5, 8],
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
