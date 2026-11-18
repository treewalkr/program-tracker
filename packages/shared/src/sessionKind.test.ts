import { describe, expect, test } from "bun:test";
import { KIND_ALIAS, SESSION_KINDS, normalizeKind, normalizeKinds } from "./index";

// Release 1 of docs/kind-rename-plan.md: "exercises" (the release-2 value) reads
// as "lifting"; "lifting" stays canonical. A release-1 rollback onto release-2
// data must parse everything below.

describe("normalizeKind", () => {
  test("release 1 maps the alias exercises → lifting", () => {
    expect(KIND_ALIAS).toEqual({ from: "exercises", to: "lifting" });
    expect(normalizeKind("exercises")).toBe("lifting");
  });

  test("canonical and other values pass through untouched", () => {
    for (const v of ["lifting", "cardio", "any", "strength", "", "Exercises", null, undefined, 3]) expect(normalizeKind(v)).toBe(v);
  });

  test("SESSION_KINDS stays lifting + cardio in release 1", () => {
    expect([...SESSION_KINDS]).toEqual(["lifting", "cardio"]);
  });
});

describe("normalizeKinds (documents and responses)", () => {
  test("rewrites kind and format at any depth, leaves other keys alone", () => {
    const doc = {
      kind: "exercises",
      format: "exercises",
      weeks: [{ sessions: [{ kind: "exercises", name: "exercises", exercises: [{ kind: "x" }] }, { kind: "cardio" }] }],
      types: [{ format: "exercises" }, { format: "any" }],
      note: "exercises",
      list: ["exercises"],
    };
    expect(normalizeKinds(doc)).toEqual({
      kind: "lifting",
      format: "lifting",
      weeks: [{ sessions: [{ kind: "lifting", name: "exercises", exercises: [{ kind: "x" }] }, { kind: "cardio" }] }],
      types: [{ format: "lifting" }, { format: "any" }],
      note: "exercises",
      list: ["exercises"],
    });
  });

  test("returns the same reference when nothing changes and never mutates", () => {
    const clean = { weeks: [{ sessions: [{ kind: "lifting" }, { kind: "cardio" }] }] };
    expect(normalizeKinds(clean)).toBe(clean);
    const dirty = { a: { kind: "exercises" }, b: { kind: "cardio" } };
    const out = normalizeKinds(dirty);
    expect(dirty.a.kind).toBe("exercises");
    expect(out.b).toBe(dirty.b);
  });

  test("scalars, null and non-plain objects pass through", () => {
    const d = new Date();
    expect(normalizeKinds(d)).toBe(d);
    expect(normalizeKinds(null)).toBe(null);
    expect(normalizeKinds("exercises")).toBe("exercises");
    expect(normalizeKinds(undefined)).toBe(undefined);
  });
});
