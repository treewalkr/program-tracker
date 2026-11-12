import { describe, expect, test } from "bun:test";
import {
  DEFAULT_LOGIN_THEME,
  LOGIN_ACCENT_SWATCHES,
  LOGIN_ACCENTS,
  LOGIN_VARIANT_INFO,
  LOGIN_VARIANTS,
  contrastRatio,
  parseLoginTheme,
} from "./loginTheme";

describe("login theme", () => {
  test("defaults to today's page", () => {
    expect(DEFAULT_LOGIN_THEME).toEqual({ variant: "classic", accent: "green" });
  });

  test("parse keeps valid fields and falls back per field", () => {
    expect(parseLoginTheme({ variant: "bold", accent: "blue" })).toEqual({ variant: "bold", accent: "blue" });
    expect(parseLoginTheme({ variant: "neon", accent: "blue" })).toEqual({ variant: "classic", accent: "blue" });
    expect(parseLoginTheme({ variant: "split", accent: "#ff00ff" })).toEqual({ variant: "split", accent: "green" });
    expect(parseLoginTheme(null)).toEqual(DEFAULT_LOGIN_THEME);
    expect(parseLoginTheme("bold")).toEqual(DEFAULT_LOGIN_THEME);
    // copy fields are not part of the theme
    expect(parseLoginTheme({ variant: "minimal", accent: "orange", headline: "hi" })).toEqual({ variant: "minimal", accent: "orange" });
  });

  test("every variant has picker copy", () => {
    for (const v of LOGIN_VARIANTS) expect(LOGIN_VARIANT_INFO[v].label).toBeTruthy();
  });

  test("every accent solid carries white text at AA (4.5:1)", () => {
    for (const a of LOGIN_ACCENTS) {
      const { solid, ramp } = LOGIN_ACCENT_SWATCHES[a];
      expect(contrastRatio(solid, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(ramp).toHaveLength(4);
    }
  });

  test("contrast ratio matches known values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});
