import { describe, expect, test } from "bun:test";
import { en, format, initialLocale, MESSAGES, th, type MessageKey } from "./messages";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("portal messages", () => {
  test("every English key has a Thai string, and nothing extra", () => {
    const enKeys = Object.keys(en).sort();
    expect(Object.keys(th).sort()).toEqual(enKeys);
    for (const k of enKeys as MessageKey[]) expect(th[k].trim().length).toBeGreaterThan(0);
  });

  test("Thai keeps every placeholder its English string has", () => {
    for (const k of Object.keys(en) as MessageKey[]) expect([k, placeholders(th[k])]).toEqual([k, placeholders(en[k])]);
  });

  test("Thai strings are actually Thai (not a copied English line)", () => {
    const untranslatable = new Set<MessageKey>(["rx.sets", "rx.rpe", "log.rpe", "cardio.rpe", "week.range"]);
    for (const k of Object.keys(en) as MessageKey[]) {
      if (untranslatable.has(k)) continue;
      expect([k, /[฀-๿]/.test(MESSAGES.th[k])]).toEqual([k, true]);
    }
  });

  test("format fills placeholders and leaves unknown ones", () => {
    expect(format("Week {n} of {total}", { n: 2 })).toBe("Week 2 of {total}");
    expect(format("Hi {name}")).toBe("Hi {name}");
  });

  test("first visit: a stored choice wins, else Thai browsers get Thai", () => {
    expect(initialLocale("en", "th-TH")).toBe("en");
    expect(initialLocale(null, "th-TH")).toBe("th");
    expect(initialLocale(null, "TH")).toBe("th");
    expect(initialLocale(null, "en-US")).toBe("en");
    expect(initialLocale("fr", undefined)).toBe("en");
  });
});
