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
  addPattern,
  patternShare,
  removePattern,
  makePrimary,
  togglePattern,
  needsTagging,
  patternTitle,
  PATTERN_GROUPS,
} from "./exerciseLibrary";
import { MOVEMENT_PATTERNS } from "@pt/shared";

const ex = (over: Partial<ExerciseDto>): ExerciseDto => ({
  id: crypto.randomUUID(),
  name: "Exercise",
  primaryMuscleGroup: "back",
  secondaryMuscleGroups: [],
  equipment: "barbell",
  movementPatterns: ["horizontal_pull"],
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
  ex({ name: "Cable Fly", primaryMuscleGroup: "chest", equipment: "cable", movementPatterns: [], functionalMovement: null }),
  ex({ name: "Zercher Squat", custom: true, archivedAt: "2026-11-01T00:00:00Z", movementPatterns: ["knee_dominant"] }),
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

describe("multiple movement patterns", () => {
  const bss = ex({ name: "Bulgarian Split Squat", equipment: "dumbbell", movementPatterns: ["knee_dominant", "hip_dominant"] });
  const pick = (pattern: string[]) =>
    visibleRows([bss], { tab: "all", q: "", filters: { muscle: [], pattern, equipment: [] }, sort: "name" }).map((e) => e.name);

  test("the pattern filter matches any tag, not only the primary", () => {
    expect(pick(["hip_dominant"])).toEqual(["Bulgarian Split Squat"]);
    expect(pick(["knee_dominant"])).toEqual(["Bulgarian Split Squat"]);
    expect(pick(["carry"])).toEqual([]);
    expect(pick([NONE])).toEqual([]);
  });

  test("the coverage map counts the exercise in every tagged row", () => {
    const c = coverage([bss]);
    expect(c.cells.get("knee_dominant|dumbbell")).toBe(1);
    expect(c.cells.get("hip_dominant|dumbbell")).toBe(1);
    expect(c.placed).toBe(1);
    expect(c.live).toBe(1);
  });

  test("No pattern counts as tagged, gets its own coverage row and never adds gaps", () => {
    const drill = ex({ name: "Cat Camel", equipment: "bodyweight", movementPatterns: ["no_pattern"] });
    expect(needsTagging(drill)).toBe(false);
    expect(needsTagging(ex({ movementPatterns: [] }))).toBe(true);
    expect(coverage([drill]).cells.get("no_pattern|bodyweight")).toBe(1);
    expect(coverage([drill]).gaps).toBe(coverage([]).gaps);
    expect(PATTERN_GROUPS.find((g) => g.patterns.includes("no_pattern"))?.label).toBe("Other");
    expect(patternTitle(["no_pattern"])).toBe("");
  });

  test("tooltip names the primary's description, then the rest", () => {
    expect(patternTitle(["knee_dominant", "hip_dominant"])).toEndWith("Also: Hip-dominant.");
    expect(patternTitle(["knee_dominant"])).not.toContain("Also");
    expect(patternTitle([])).toBe("");
  });
});

describe("togglePattern / makePrimary", () => {
  test("the first tag added is primary; more append in order", () => {
    expect(togglePattern([], "knee_dominant")).toEqual(["knee_dominant"]);
    expect(togglePattern(["knee_dominant"], "hip_dominant")).toEqual(["knee_dominant", "hip_dominant"]);
  });

  test("removing the primary promotes the next tag", () => {
    expect(togglePattern(["knee_dominant", "hip_dominant", "carry"], "knee_dominant")).toEqual(["hip_dominant", "carry"]);
  });

  test("No pattern is exclusive both ways", () => {
    expect(togglePattern(["knee_dominant", "hip_dominant"], "no_pattern")).toEqual(["no_pattern"]);
    expect(togglePattern(["no_pattern"], "carry")).toEqual(["carry"]);
  });

  test("a full list takes no more", () => {
    const full = ["knee_dominant", "hip_dominant", "carry", "rotation"];
    expect(togglePattern(full, "isolation")).toEqual(full);
  });

  test("makePrimary moves a selected tag to the front", () => {
    expect(makePrimary(["knee_dominant", "hip_dominant", "carry"], "carry")).toEqual(["carry", "knee_dominant", "hip_dominant"]);
    expect(makePrimary(["knee_dominant"], "carry")).toEqual(["knee_dominant"]);
  });
});

describe("bulk pattern edits", () => {
  test("add appends: primary only on an untagged exercise", () => {
    expect(addPattern([], "carry")).toEqual(["carry"]);
    expect(addPattern(["knee_dominant"], "hip_dominant")).toEqual(["knee_dominant", "hip_dominant"]);
    expect(addPattern(["knee_dominant", "hip_dominant"], "hip_dominant")).toEqual(["knee_dominant", "hip_dominant"]);
    expect(addPattern(["no_pattern"], "carry")).toEqual(["carry"]);
  });

  test("remove promotes the next tag", () => {
    expect(removePattern(["knee_dominant", "hip_dominant"], "knee_dominant")).toEqual(["hip_dominant"]);
  });

  test("share reads ✓ all, N of M, or nothing", () => {
    const rows = [{ movementPatterns: ["knee_dominant", "anti_lateral_flexion"] }, { movementPatterns: ["knee_dominant"] }];
    expect(patternShare(rows, "knee_dominant")).toEqual({ n: 2, all: true, text: "✓ all" });
    expect(patternShare(rows, "anti_lateral_flexion")).toEqual({ n: 1, all: false, text: "1 of 2" });
    expect(patternShare(rows, "carry")).toEqual({ n: 0, all: false, text: "" });
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
    expect(c.gaps).toBe(15 * 9 - 1); // No pattern is never a gap
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

describe("coverage rows", () => {
  test("every movement pattern has exactly one row group", () => {
    const rows = PATTERN_GROUPS.flatMap((g) => g.patterns);
    expect([...rows].sort()).toEqual([...MOVEMENT_PATTERNS].sort());
    expect(PATTERN_GROUPS.find((g) => g.patterns.includes("carry"))?.label).toBe("Other");
  });
});
