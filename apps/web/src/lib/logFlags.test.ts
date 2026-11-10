import { describe, expect, test } from "bun:test";
import {
  EMPTY_READINESS,
  FLAG_NOTE_MAX,
  flagChips,
  painExercises,
  parseFlags,
  parseReadiness,
  readinessInput,
  readinessLine,
  readinessRated,
  sessionFlags,
  setFlagNote,
  tapScale,
  toggleFlag,
} from "./logFlags";
import { setSkipReason, skipExercise, swapSlot, type SheetRow } from "./logSheet";

const row = (programExerciseId: string, setNumber: number, exerciseId = `ex-${programExerciseId}`): SheetRow => ({
  key: `${programExerciseId}-${setNumber}`,
  exerciseId,
  slotExerciseId: exerciseId,
  programExerciseId,
  setNumber,
  type: "working",
  prescribedReps: 5,
  weight: "",
  reps: "",
  rpe: "",
});
const rows = [row("pe1", 1), row("pe1", 2), row("pe2", 1), row("pe3", 1)];

describe("readiness", () => {
  test("a tap sets the value; the same tap clears it", () => {
    expect(tapScale(null, 3)).toBe(3);
    expect(tapScale(3, 4)).toBe(4);
    expect(tapScale(4, 4)).toBeNull();
  });

  test("nothing rated sends nothing; each rated field is sent", () => {
    expect(readinessRated(EMPTY_READINESS)).toBe(false);
    expect(readinessInput(EMPTY_READINESS)).toEqual({});
    expect(readinessInput({ energy: 6, sleep: null, soreness: null })).toEqual({ perceivedEnergy: 6 });
    expect(readinessInput({ energy: null, sleep: 2, soreness: null })).toEqual({ readiness: { sleep: 2 } });
    expect(readinessInput({ energy: 8, sleep: 4, soreness: 1 })).toEqual({ perceivedEnergy: 8, readiness: { sleep: 4, soreness: 1 } });
  });

  test("a draft's readiness keeps only in-range integers", () => {
    expect(parseReadiness({ energy: 7 })).toEqual({ energy: 7, sleep: null, soreness: null });
    expect(parseReadiness({ energy: 0, readiness: { sleep: 5, soreness: 6 } })).toEqual({ energy: null, sleep: 5, soreness: null });
    expect(parseReadiness({ energy: 7.5, readiness: "x" })).toEqual(EMPTY_READINESS);
  });

  test("history line names each rated field", () => {
    expect(readinessLine({ perceivedEnergy: 6, readiness: { sleep: 2, soreness: 4 } })).toBe("Energy 6/10 · Sleep 2/5 · Soreness 4/5");
    expect(readinessLine({ perceivedEnergy: null, readiness: { soreness: 3 } })).toBe("Soreness 3/5");
    expect(readinessLine({ perceivedEnergy: null, readiness: null })).toBeNull();
    expect(readinessLine({})).toBeNull();
  });
});

describe("flags", () => {
  test("pick a kind, switch it (the note stays), pick it again to clear", () => {
    let f = toggleFlag({}, "pe1", "pain");
    expect(f).toEqual({ pe1: { kind: "pain", note: "" } });
    f = setFlagNote(f, "pe1", "knee");
    f = toggleFlag(f, "pe1", "technique");
    expect(f).toEqual({ pe1: { kind: "technique", note: "knee" } });
    expect(toggleFlag(f, "pe1", "technique")).toEqual({});
  });

  test("a note needs a flag and is capped at 280", () => {
    expect(setFlagNote({}, "pe1", "x")).toEqual({});
    const f = setFlagNote({ pe1: { kind: "pain", note: "" } }, "pe1", "x".repeat(300));
    expect(f.pe1.note).toHaveLength(FLAG_NOTE_MAX);
  });

  test("session flags: flagged exercises and whole-exercise skips, in sheet order", () => {
    let sheet = skipExercise(rows, "pe3");
    sheet = setSkipReason(sheet, "pe3", "pain");
    sheet = skipExercise(sheet, "pe2");
    const out = sessionFlags(sheet, { pe1: { kind: "technique", note: "  hips rise  " }, gone: { kind: "pain", note: "" } });
    expect(out).toEqual([
      { programExerciseId: "pe1", exerciseId: "ex-pe1", kind: "technique", note: "hips rise" },
      { programExerciseId: "pe2", exerciseId: "ex-pe2", kind: "skipped" },
      { programExerciseId: "pe3", exerciseId: "ex-pe3", kind: "skipped", reason: "pain" },
    ]);
  });

  test("a flag on a swapped slot names the exercise actually done; a blank note is left out", () => {
    const sheet = swapSlot(rows, "pe1", "ex-hack");
    expect(sessionFlags(sheet, { pe1: { kind: "pain", note: "   " } })).toEqual([
      { programExerciseId: "pe1", exerciseId: "ex-hack", kind: "pain" },
    ]);
  });

  test("pain = a Pain flag or a skip for pain, once per exercise", () => {
    const sheet = setSkipReason(skipExercise(rows, "pe2"), "pe2", "pain");
    expect(painExercises(sheet, { pe1: { kind: "pain", note: "" }, pe2: { kind: "pain", note: "" }, pe3: { kind: "technique", note: "" } })).toEqual([
      "ex-pe1",
      "ex-pe2",
    ]);
    expect(painExercises(rows, {})).toEqual([]);
  });

  test("a draft's flags drop anything malformed", () => {
    expect(parseFlags(null)).toEqual({});
    expect(parseFlags([1])).toEqual({});
    expect(parseFlags({ a: { kind: "pain", note: 3 }, b: { kind: "skipped" }, c: null })).toEqual({ a: { kind: "pain", note: "" } });
  });

  test("history chips: tone by kind, skip reason last, note kept", () => {
    const nameOf = (id: string) => ({ "ex-1": "Hack Squat", "ex-2": "Leg Curl" })[id] ?? id;
    const chips = flagChips(
      [
        { programExerciseId: "pe1", exerciseId: "ex-1", kind: "pain", note: "knee" },
        { programExerciseId: "pe2", exerciseId: "ex-2", kind: "skipped", reason: "time" },
        { programExerciseId: "pe3", exerciseId: "ex-2", kind: "skipped", reason: "pain" },
        { programExerciseId: null, exerciseId: "ex-1", kind: "technique" },
      ],
      nameOf
    );
    expect(chips.map((c) => [c.tone, c.text, c.note])).toEqual([
      ["bad", "Pain · Hack Squat", "knee"],
      ["neutral", "Skipped · Leg Curl · time", null],
      ["bad", "Skipped · Leg Curl · pain", null],
      ["warn", "Technique · Hack Squat", null],
    ]);
    expect(flagChips(null, nameOf)).toEqual([]);
  });
});
