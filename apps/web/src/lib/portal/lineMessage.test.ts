import { describe, expect, test } from "bun:test";
import { guessClientLocale, lineMessage } from "./lineMessage";

describe("LINE message", () => {
  test("Thai for a name written in Thai, else English", () => {
    expect(guessClientLocale("ณัฐพงศ์ ว.")).toBe("th");
    expect(guessClientLocale("Nattapong W.")).toBe("en");
  });

  test("both languages carry the name and the whole link", () => {
    const link = "https://pt.pinroj.com/me/link/abc123";
    for (const l of ["en", "th"] as const) {
      const m = lineMessage(l, " Nat ", link);
      expect(m).toContain("Nat");
      expect(m.endsWith(link)).toBe(true);
    }
    expect(lineMessage("th", "Nat", link)).toMatch(/[\u0E00-\u0E7F]/);
  });
});
