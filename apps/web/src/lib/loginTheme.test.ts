import { describe, expect, test } from "bun:test";
import { BLOCK_WEEKS, PREVIEW_DEVICES, PREVIEW_MAX_HEIGHT, SEASON_WEEKS, loginErrorMessage, previewScale } from "./loginTheme";

describe("login copy", () => {
  test("known OAuth error codes get their own message; unknown ones a generic retry", () => {
    expect(loginErrorMessage("not_allowed")).toContain("hasn't been added as a trainer");
    expect(loginErrorMessage("weird")).toBe("Sign-in didn't go through. Try again.");
    expect(loginErrorMessage(null)).toBeNull();
    expect(loginErrorMessage("")).toBeNull();
  });

  test("the decorative weeks are Mon–Sun rows on the 0–4 ramp", () => {
    for (const week of [...BLOCK_WEEKS, ...SEASON_WEEKS]) {
      expect(week).toHaveLength(7);
      for (const level of week) expect(level >= 0 && level <= 4).toBe(true);
    }
    expect(SEASON_WEEKS).toHaveLength(12);
  });
});

describe("preview scale", () => {
  test("fits the screen into the space, never enlarges, caps the height, and guesses half before layout", () => {
    expect(previewScale(640, PREVIEW_DEVICES.desktop)).toBe(0.5);
    expect(previewScale(4000, PREVIEW_DEVICES.desktop)).toBe(PREVIEW_MAX_HEIGHT / 800);
    expect(previewScale(390, PREVIEW_DEVICES.phone)).toBe(PREVIEW_MAX_HEIGHT / 780);
    expect(previewScale(200, PREVIEW_DEVICES.phone)).toBe(200 / 390);
    expect(previewScale(4000, { width: 300, height: 300 })).toBe(1);
    expect(previewScale(0, PREVIEW_DEVICES.desktop)).toBe(0.5);
  });
});
