import { describe, expect, test } from "bun:test";
import { ProgramSession } from "./domain";
import { SESSION_TYPE_DEFAULTS, findSessionType, normalizeTypeName } from "./sessionTypes";

describe("session types", () => {
  test("defaults cover both formats with unique names", () => {
    const names = SESSION_TYPE_DEFAULTS.map((t) => t.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(SESSION_TYPE_DEFAULTS.some((t) => t.format === "lifting")).toBe(true);
    expect(SESSION_TYPE_DEFAULTS.some((t) => t.format === "cardio")).toBe(true);
  });

  test("normalizeTypeName trims and collapses spaces", () => {
    expect(normalizeTypeName("  Zone   2 ")).toBe("Zone 2");
  });

  test("findSessionType matches case-insensitively and ignores extra spaces", () => {
    const types = [
      { id: "a", name: "Zone 2", format: "cardio" as const },
      { id: "b", name: "Mobility", format: "lifting" as const },
    ];
    expect(findSessionType(types, " zone  2")?.id).toBe("a");
    expect(findSessionType(types, "mobility")?.id).toBe("b");
    expect(findSessionType(types, "Yoga")).toBeNull();
    expect(findSessionType(types, undefined)).toBeNull();
  });

  test("ProgramSession keeps typeId/typeName and still parses without them", () => {
    const base = {
      id: "s1", name: "Lower", seq: 1, order: 0, kind: "lifting" as const,
      exercises: [{ id: "e1", exerciseId: "x", order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
    };
    expect(ProgramSession.parse(base).typeName).toBeUndefined();
    const typed = ProgramSession.parse({ ...base, typeId: "t1", typeName: "Strength" });
    expect(typed.typeId).toBe("t1");
    expect(typed.typeName).toBe("Strength");
    expect(ProgramSession.safeParse({ ...base, typeName: "x".repeat(41) }).success).toBe(false);
  });
});
