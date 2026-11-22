import { describe, expect, test } from "bun:test";
import { CARDIO_GUIDE, CARDIO_GUIDE_IDS } from "./cardio";

const kinds = (b: object) => Object.keys(b).join();

describe("Cardio guide", () => {
  test("both languages have the same sections, in order, with the same blocks", () => {
    const { en, th } = CARDIO_GUIDE;
    expect(en.sections.map((s) => s.id)).toEqual([...CARDIO_GUIDE_IDS]);
    expect(th.sections.map((s) => s.id)).toEqual([...CARDIO_GUIDE_IDS]);
    en.sections.forEach((s, i) => {
      expect(th.sections[i].blocks.map(kinds)).toEqual(s.blocks.map(kinds));
    });
  });
});
