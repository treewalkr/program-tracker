import { describe, expect, test } from "bun:test";
import type { ExerciseDto } from "./api/types";
import {
  copyName,
  coverage,
  emptyFilters,
  mapScope,
  pickCell,
  prefillFrom,
  removeAction,
  similarNames,
  tabCounts,
  validateForm,
  visibleRows,
  formFrom,
  NONE,
} from "./exerciseLibrary";

const ex = (over: Partial<ExerciseDto>): ExerciseDto => ({
  id: crypto.randomUUID(),
  name: "Exercise",
  primaryMuscleGroup: "back",
  secondaryMuscleGroups: [],
  equipment: "barbell",
  movementPattern: "horizontal_pull",
  functionalMovement: "pull",
  note: null,
  custom: false,
  archivedAt: null,
  usedIn: 0,
  ...over,
});

const list = [
  ex({ name: "Bent Over Row", usedIn: 3 }),
  ex({ name: "Pendlay Row", custom: true }),
  ex({ name: "Cable Fly", primaryMuscleGroup: "chest", equipment: "cable", movementPattern: null, functionalMovement: null }),
  ex({ name: "Zercher Squat", custom: true, archivedAt: "2026-11-01T00:00:00Z", movementPattern: "knee_dominant" }),
];

describe("tabs and rows", () => {
  test("counts exclude archived from live tabs", () => {
    expect(tabCounts(list)).toEqual({ all: 3, mine: 1, untagged: 1, archived: 1 });
  });

  test("filters, search and sort combine", () => {
    const f = { ...emptyFilters(), pattern: [NONE] };
    expect(visibleRows(list, { tab: "all", q: "", filters: f, sort: "name" }).map((e) => e.name)).toEqual(["Cable Fly"]);
    expect(visibleRows(list, { tab: "all", q: "row", filters: emptyFilters(), sort: "uses" }).map((e) => e.name)).toEqual([
      "Bent Over Row",
      "Pendlay Row",
    ]);
    expect(visibleRows(list, { tab: "archived", q: "", filters: emptyFilters(), sort: "name" }).map((e) => e.name)).toEqual([
      "Zercher Squat",
    ]);
  });
});

describe("coverage map", () => {
  test("counts live exercises per pattern × equipment and finds gaps", () => {
    const c = coverage(list);
    expect(c.cells.get("horizontal_pull|barbell")).toBe(2);
    expect(c.cells.get(`${NONE}|cable`)).toBe(1);
    expect(c.cells.get("knee_dominant|barbell")).toBeUndefined(); // archived doesn't count
    expect(c.placed).toBe(2);
    expect(c.live).toBe(3);
    expect(c.gaps).toBe(12 * 9 - 1);
  });

  test("a cell click sets filters; clicking it again clears them", () => {
    const f = pickCell({ muscle: ["chest"], pattern: [], equipment: [] }, "vertical_push", "cable");
    expect(f).toEqual({ muscle: [], pattern: ["vertical_push"], equipment: ["cable"] });
    expect(mapScope(f)).toEqual({ pattern: "vertical_push", equipment: "cable" });
    expect(pickCell(f, "vertical_push", "cable")).toEqual(emptyFilters());
    expect(mapScope({ muscle: ["back"], pattern: [], equipment: [] })).toBeNull();
  });

  test("prefill uses single pattern + equipment filters, never 'untagged'", () => {
    expect(prefillFrom({ muscle: [], pattern: ["vertical_push"], equipment: ["cable"] })).toEqual({
      movementPattern: "vertical_push",
      equipment: "cable",
    });
    expect(prefillFrom({ muscle: [], pattern: [NONE], equipment: [] })).toEqual({ movementPattern: null, equipment: "" });
  });
});

describe("edit rules", () => {
  test("seed hides, used custom archives, unused custom deletes", () => {
    expect(removeAction(list[0]).kind).toBe("hide");
    expect(removeAction(ex({ custom: true, usedIn: 2 })).kind).toBe("archive");
    expect(removeAction(list[1]).kind).toBe("delete");
  });

  test("duplicate guard: exact names block, similar names are listed", () => {
    expect(similarNames(list, "pendlay row").exact?.name).toBe("Pendlay Row");
    expect(similarNames(list, "Pendlay Barbell Row").similar.map((e) => e.name)).toContain("Pendlay Row");
    const f = formFrom(null, { name: "Bent over row" });
    expect(validateForm(f, list)).toMatchObject({ name: expect.any(String), primaryMuscleGroup: expect.any(String) });
    expect(validateForm(formFrom(list[0]), list, list[0].id)).toEqual({});
  });

  test("copies get a free name", () => {
    expect(copyName(list, "Pendlay Row")).toBe("Pendlay Row (mine)");
    expect(copyName([...list, ex({ name: "Pendlay Row (mine)" })], "Pendlay Row")).toBe("Pendlay Row (mine 2)");
  });
});
