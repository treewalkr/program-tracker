import { describe, expect, test } from "bun:test";
import { activeSection, type SpySection } from "./tocSpy";
import * as spy from "./tocSpy";

// The /en/exercises case: move-in's tail (-308..222) still overlaps the top of the screen
// while answers (234..724) is where search landed, at the bottom of the page.
const jump: SpySection[] = [
  { id: "ai", top: -620, bottom: -320 },
  { id: "move-in", top: -308, bottom: 222 },
  { id: "answers", top: 234, bottom: 724 },
];

describe("activeSection", () => {
  test("follows the reading line, not an earlier section's overlapping tail", () => {
    expect(activeSection(jump, { line: 280, viewport: 800, atBottom: false })).toBe("answers");
  });

  test("an earlier section holds until the next one reaches the line", () => {
    expect(activeSection(jump, { line: 100, viewport: 800, atBottom: false })).toBe("move-in");
  });

  test("before the first section, the first is current", () => {
    const s = [{ id: "a", top: 300, bottom: 600 }, { id: "b", top: 600, bottom: 900 }];
    expect(activeSection(s, { line: 280, viewport: 800, atBottom: false })).toBe("a");
  });

  test("at the page bottom the jumped-to section wins when it is on screen", () => {
    const s: SpySection[] = [
      { id: "a", top: -400, bottom: 100 },
      { id: "b", top: 300, bottom: 500 },
      { id: "c", top: 520, bottom: 700 },
    ];
    expect(activeSection(s, { line: 280, viewport: 800, atBottom: true, hash: "b" })).toBe("b");
  });

  test("at the page bottom without a usable hash, the last section is current", () => {
    const s: SpySection[] = [
      { id: "a", top: -400, bottom: -50 },
      { id: "b", top: 400, bottom: 600 },
      { id: "c", top: 620, bottom: 700 },
    ];
    expect(activeSection(s, { line: 280, viewport: 800, atBottom: true })).toBe("c");
    expect(activeSection(s, { line: 280, viewport: 800, atBottom: true, hash: "a" })).toBe("c");
  });

  test("no sections, no current", () => {
    expect(activeSection([], { line: 280, viewport: 800, atBottom: false })).toBeNull();
  });
});

describe("hashId", () => {
  test("decodes a hash, and a malformed one reads as none instead of throwing", () => {
    expect(spy.hashId("#missed")).toBe("missed");
    expect(spy.hashId("#%E0%B8%81")).toBe("ก");
    expect(spy.hashId("")).toBe("");
    expect(spy.hashId("#50%")).toBe("");
    expect(spy.hashId("#%E0%A4%A")).toBe("");
  });
});
