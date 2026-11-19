import { describe, expect, test } from "bun:test";
import { PROGRAMS_GUIDE, PROGRAMS_GUIDE_IDS } from "./programsWeeks";

const kinds = (b: object) => Object.keys(b).join();

describe("Programs & weeks guide", () => {
  test("both languages have the same sections, in order, with the same blocks", () => {
    const { en, th } = PROGRAMS_GUIDE;
    expect(en.sections.map((s) => s.id)).toEqual([...PROGRAMS_GUIDE_IDS]);
    expect(th.sections.map((s) => s.id)).toEqual([...PROGRAMS_GUIDE_IDS]);
    en.sections.forEach((s, i) => {
      expect(th.sections[i].blocks.map(kinds)).toEqual(s.blocks.map(kinds));
    });
  });

  test("portal quotes are filled in, never left as placeholders", () => {
    for (const g of Object.values(PROGRAMS_GUIDE)) {
      const text = JSON.stringify(g);
      expect(text).not.toContain("{date}");
      expect(text).not.toContain("undefined");
    }
  });
});
