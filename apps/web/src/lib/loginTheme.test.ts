import { describe, expect, test } from "bun:test";
import { BLOCK_WEEKS, SEASON_WEEKS, loginErrorMessage } from "./loginTheme";

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
