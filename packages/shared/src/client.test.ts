import { describe, expect, test } from "bun:test";
import { ageOn, EXPERIENCE_LABEL } from "./client";
import { CLIENT_EXPERIENCES } from "./domain";

describe("ageOn", () => {
  test("counts whole years once the birthday has passed", () => {
    expect(ageOn("1992-03-14", "2026-11-08")).toBe(34);
  });

  test("not a year older until the birthday", () => {
    expect(ageOn("1992-11-09", "2026-11-08")).toBe(33);
    expect(ageOn("1992-12-01", "2026-11-08")).toBe(33);
  });

  test("birthday itself counts", () => {
    expect(ageOn("1992-11-08", "2026-11-08")).toBe(34);
  });

  test("29 Feb birthday turns over on 1 Mar in common years", () => {
    expect(ageOn("2000-02-29", "2025-02-28")).toBe(24);
    expect(ageOn("2000-02-29", "2025-03-01")).toBe(25);
  });

  test("born today is 0", () => {
    expect(ageOn("2026-11-08", "2026-11-08")).toBe(0);
  });
});

describe("EXPERIENCE_LABEL", () => {
  test("labels every experience level", () => {
    for (const level of CLIENT_EXPERIENCES) {
      expect(EXPERIENCE_LABEL[level].label.length).toBeGreaterThan(0);
      expect(EXPERIENCE_LABEL[level].band.length).toBeGreaterThan(0);
    }
    expect(EXPERIENCE_LABEL.intermediate).toEqual({ label: "Intermediate", band: "1–3 yrs" });
  });
});
