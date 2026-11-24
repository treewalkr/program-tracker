import { describe, expect, test } from "bun:test";
import { editChanged, hasDraft } from "./libraryDraft";

describe("hasDraft", () => {
  test("empty or blank fields are no draft", () => {
    expect(hasDraft()).toBe(false);
    expect(hasDraft("", "   ", "\n")).toBe(false);
  });
  test("any text in any field is a draft", () => {
    expect(hasDraft("", "Cap RPE at 8")).toBe(true);
  });
  test("non-text fields (a picked kind, a client id default) don't count", () => {
    expect(hasDraft(3, null, undefined, "")).toBe(false);
  });
});

describe("editChanged", () => {
  const saved = { goal: "Strength", level: "beginner", days: 3, note: null as string | null };

  test("no edit open, or nothing to compare against, is clean", () => {
    expect(editChanged(null, saved)).toBe(false);
    expect(editChanged({ goal: "x" }, null)).toBe(false);
  });
  test("a copy of the saved values is clean", () => {
    expect(editChanged({ ...saved }, saved)).toBe(false);
  });
  test("whitespace the save would trim is clean; an empty note equals a missing one", () => {
    expect(editChanged({ ...saved, goal: " Strength  ", note: "" }, saved)).toBe(false);
  });
  test("a changed text, number or pick is dirty", () => {
    expect(editChanged({ ...saved, goal: "Strength!" }, saved)).toBe(true);
    expect(editChanged({ ...saved, days: 4 }, saved)).toBe(true);
    expect(editChanged({ ...saved, note: "why" }, saved)).toBe(true);
  });
  test("lists compare in order", () => {
    expect(editChanged({ tags: ["a", "b"] }, { tags: ["a", "b"] })).toBe(false);
    expect(editChanged({ tags: ["b", "a"] }, { tags: ["a", "b"] })).toBe(true);
    expect(editChanged({ tags: ["a"] }, { tags: ["a", "b"] })).toBe(true);
  });
  test("only the edit's own fields are compared", () => {
    expect(editChanged({ goal: "Strength" }, saved)).toBe(false);
  });
});
