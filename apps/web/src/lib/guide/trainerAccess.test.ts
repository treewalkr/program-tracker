import { describe, expect, test } from "bun:test";
import { TRAINER_ACCESS_GUIDE, TRAINER_ACCESS_IDS } from "./trainerAccess";

const kinds = (b: object) => Object.keys(b).join();

describe("Trainer access guide", () => {
  test("both languages have the same sections, in order, with the same blocks", () => {
    const { en, th } = TRAINER_ACCESS_GUIDE;
    expect(en.sections.map((s) => s.id)).toEqual([...TRAINER_ACCESS_IDS]);
    expect(th.sections.map((s) => s.id)).toEqual([...TRAINER_ACCESS_IDS]);
    en.sections.forEach((s, i) => {
      expect(th.sections[i].blocks.map(kinds)).toEqual(s.blocks.map(kinds));
    });
  });
});
