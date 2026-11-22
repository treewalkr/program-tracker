import { describe, expect, test } from "bun:test";
import { closeUpIndex } from "./capture";

const box = (width: number, height: number) => ({ width, height });

describe("closeUpIndex", () => {
  test("a big enough element is captured as is", () => {
    expect(closeUpIndex([box(400, 120), box(900, 600)])).toBe(0);
  });

  test("a small heading climbs to the first ancestor that clears the minimum", () => {
    // h2 "Training week" → panel head (wide, short) → panel
    expect(closeUpIndex([box(97, 18), box(700, 40), box(700, 480)])).toBe(2);
  });

  test("never climbs past the area cap", () => {
    expect(closeUpIndex([box(97, 18), box(700, 40), box(1400, 3000)], undefined, 1440 * 900 * 0.5)).toBe(1);
  });

  test("an element already over the cap stays itself", () => {
    expect(closeUpIndex([box(1400, 3000), box(1440, 4000)], undefined, 1000)).toBe(0);
  });

  test("no ancestor clears the minimum: the outermost one", () => {
    expect(closeUpIndex([box(20, 20), box(60, 30)])).toBe(1);
  });

  test("an empty chain falls back to the element", () => {
    expect(closeUpIndex([])).toBe(0);
  });
});
