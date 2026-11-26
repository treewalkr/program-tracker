import { describe, expect, test } from "bun:test";
import { activeSection } from "./tocSpy";

describe("activeSection", () => {
  test("no sections, no current", () => {
    expect(activeSection([], { line: 280, viewport: 800, atBottom: false })).toBeNull();
  });
  test("the section under the top of the screen is current", () => {
    const s = [{ id: "a", top: -100, bottom: 300 }, { id: "b", top: 300, bottom: 700 }];
    expect(activeSection(s, { line: 280, viewport: 800, atBottom: false })).toBe("a");
  });
});
