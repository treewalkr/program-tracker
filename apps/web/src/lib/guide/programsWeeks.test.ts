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

  test("both languages place the same figures, each with a caption", () => {
    const figs = (g: typeof PROGRAMS_GUIDE.en) =>
      g.sections.flatMap((s) => s.blocks.flatMap((b) => ("fig" in b ? [b.fig] : [])));
    expect(figs(PROGRAMS_GUIDE.th)).toEqual(figs(PROGRAMS_GUIDE.en));
    for (const g of Object.values(PROGRAMS_GUIDE))
      for (const s of g.sections) for (const b of s.blocks) if ("fig" in b) expect(b.caption.length).toBeGreaterThan(20);
  });

  test("portal quotes are filled in, never left as placeholders", () => {
    for (const g of Object.values(PROGRAMS_GUIDE)) {
      const text = JSON.stringify(g);
      expect(text).not.toContain("{date}");
      expect(text).not.toContain("undefined");
    }
  });
});
