import { afterEach, describe, expect, mock, test } from "bun:test";

const page = { url: new URL("http://x/th/me") };
mock.module("$app/state", () => ({ page }));
mock.module("$app/environment", () => ({ browser: false }));
mock.module("$app/navigation", () => ({ goto: async () => {}, beforeNavigate: () => {}, afterNavigate: () => {} }));
const { fmtDay, fmtShortDate, weekdayName } = await import("./i18n.svelte");

const Real = Intl.DateTimeFormat;
afterEach(() => {
  Intl.DateTimeFormat = Real;
  page.url = new URL("http://x/th/me");
});

/** Count formatter constructions while `run` executes. */
function constructions(run: () => void): number {
  let n = 0;
  Intl.DateTimeFormat = function (...args: ConstructorParameters<typeof Real>) {
    n++;
    return new Real(...args);
  } as unknown as typeof Real;
  run();
  return n;
}

describe("portal date formatting", () => {
  test("reuses one formatter per language and format", () => {
    const n = constructions(() => {
      for (let i = 0; i < 5; i++) {
        fmtDay("2026-11-17");
        fmtShortDate("2026-11-18");
        weekdayName(1);
      }
    });
    expect(n).toBeLessThanOrEqual(3);
  });

  test("follows the page's language", () => {
    page.url = new URL("http://x/en/me");
    expect(fmtDay("2026-11-17")).toBe("Tue 17 Nov");
    expect(weekdayName(1)).toBe("Monday");
    page.url = new URL("http://x/th/me");
    expect(fmtDay("2026-11-17")).not.toBe("Tue 17 Nov");
    expect(weekdayName(1)).toBe("วันจันทร์");
  });
});
