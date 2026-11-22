import { describe, expect, test } from "bun:test";
import { asSent, draftLoad, restartLoads, savedLoad, setLoad, startLoad, type LoadRow } from "./loadMode";

const row = (over: Partial<LoadRow> & { key: string }): LoadRow => ({
  programExerciseId: "pa",
  setNumber: 1,
  weight: "",
  load: "kg",
  ...over,
});
const loads = (rows: LoadRow[]) => rows.map((r) => `${r.key}=${r.load}`);

describe("startLoad: the mode a set opens in", () => {
  const noLast = { bodyweight: false, last: null };
  test("a coach-set load is kg, even on a bodyweight move", () => {
    expect(startLoad({ bodyweight: true }, { targetWeightKg: 10 })).toBe("kg");
    expect(startLoad({ bodyweight: true }, { targetWeightKg: 0 })).toBe("bw");
  });

  test("a library bodyweight move is BW", () => {
    expect(startLoad({ bodyweight: true }, { targetWeightKg: null })).toBe("bw");
  });

  test("last time with no load is BW on free weights; with load, or no history, kg", () => {
    expect(startLoad({ equipment: "dumbbell", last: { weightKg: null } }, { targetWeightKg: null })).toBe("bw");
    expect(startLoad({ equipment: "kettlebell", last: { weightKg: 0 } }, {})).toBe("bw");
    expect(startLoad({ last: { weightKg: null } }, {})).toBe("bw");
    expect(startLoad({ equipment: "dumbbell", last: { weightKg: 12 } }, {})).toBe("kg");
    expect(startLoad(noLast, {})).toBe("kg");
  });

  test("a stack, cable, bar or plate-loaded move opens in kg whatever last time had", () => {
    // Rope crunch on a cable: last time's blank kg was a missed entry, not bodyweight
    for (const equipment of ["cable", "machine", "barbell", "plate_loaded"] as const) {
      expect(startLoad({ equipment, last: { weightKg: null } }, {})).toBe("kg");
    }
  });
});

describe("setLoad: one switch, later untouched sets follow", () => {
  const rows = [
    row({ key: "pa:1" }),
    row({ key: "pa:2", setNumber: 2 }),
    row({ key: "pa:3", setNumber: 3, weight: 6 }),
    row({ key: "pa:4", setNumber: 4, timed: true }),
    row({ key: "pb:1", programExerciseId: "pb" }),
  ];

  test("the set is picked; blank later sets follow; typed, timed and other exercises don't", () => {
    const out = setLoad(rows, "pa:1", "bw");
    expect(loads(out)).toEqual(["pa:1=bw", "pa:2=bw", "pa:3=kg", "pa:4=kg", "pb:1=kg"]);
    expect(out[0].loadPicked).toBe(true);
    expect(out[1].loadPicked).toBeUndefined();
  });

  test("a filled-down kg is not typed: its set follows", () => {
    const copied = rows.map((r) => (r.key === "pa:2" ? { ...r, weight: 10, copied: ["weight" as const] } : r));
    expect(loads(setLoad(copied, "pa:1", "bw")).slice(0, 2)).toEqual(["pa:1=bw", "pa:2=bw"]);
  });

  test("a set still on its prefilled kg is untouched; one changed from it is not", () => {
    const planned = [row({ key: "pa:1", weight: 12, planned: { weight: "12" } }), row({ key: "pa:2", setNumber: 2, weight: 12, planned: { weight: "12" } }), row({ key: "pa:3", setNumber: 3, weight: 14, planned: { weight: "12" } })];
    expect(loads(setLoad(planned, "pa:1", "bw"))).toEqual(["pa:1=bw", "pa:2=bw", "pa:3=kg"]);
  });

  test("an unknown key changes nothing", () => {
    expect(loads(setLoad(rows, "zz", "bw"))).toEqual(loads(rows));
  });
});

describe("asSent / savedLoad / draftLoad / restartLoads", () => {
  test("a BW set sends no kg; a kg set and a timed set keep theirs", () => {
    expect(asSent(row({ key: "a", load: "bw", weight: 12 })).weight).toBe("");
    expect(asSent(row({ key: "a", load: "kg", weight: 12 })).weight).toBe(12);
    expect(asSent(row({ key: "a", load: "bw", weight: 12, timed: true })).weight).toBe(12);
  });

  test("a saved set with no kg reopens as BW", () => {
    expect(savedLoad(null)).toBe("bw");
    expect(savedLoad(undefined)).toBe("bw");
    expect(savedLoad(0)).toBe("kg");
    expect(savedLoad(20)).toBe("kg");
  });

  test("a draft row without a mode: typed kg is kg, else as the fresh sheet opens it", () => {
    const fresh = [row({ key: "pa:1", load: "bw" }), row({ key: "pa:2", setNumber: 2, load: "bw" })];
    const { load: _, ...bare } = row({ key: "pa:1" });
    expect(draftLoad({ ...bare, weight: 10 }, fresh).load).toBe("kg");
    expect(draftLoad(bare, fresh).load).toBe("bw");
    // an extra set not on the fresh sheet reads its exercise's mode
    expect(draftLoad({ ...bare, key: "pa:x3" }, fresh).load).toBe("bw");
    expect(draftLoad(row({ key: "pa:1", load: "kg" }), fresh).load).toBe("kg");
  });

  test("restartLoads re-runs the start on one exercise's sets nobody picked", () => {
    const picked = [row({ key: "pa:1", load: "kg", loadPicked: true }), row({ key: "pa:2", setNumber: 2 }), row({ key: "pa:3", setNumber: 3, timed: true }), row({ key: "pb:1", programExerciseId: "pb" })];
    expect(loads(restartLoads(picked, "pa", () => "bw"))).toEqual(["pa:1=kg", "pa:2=bw", "pa:3=kg", "pb:1=kg"]);
  });
});
