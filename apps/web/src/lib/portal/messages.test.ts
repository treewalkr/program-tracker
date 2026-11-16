import { describe, expect, test } from "bun:test";
import { carriesCoachLabel, en, format, initialLocale, MESSAGES, th, type MessageKey } from "./messages";

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

  test("Thai weight lines say กก., never kg (the cell beside them is labelled กก.)", () => {
    for (const k of ["log.needKg", "log.needKgOne", "log.kgCell", "log.kg", "rx.kg"] as const) expect([k, /kg/i.test(th[k])]).toEqual([k, false]);
  });

  test("a name that already says Coach / โค้ช doesn't get the label again", () => {
    expect(carriesCoachLabel("Coach Ploy")).toBe(true);
    expect(carriesCoachLabel("โค้ชพลอย")).toBe(true);
    expect(carriesCoachLabel("โค้ช พลอย")).toBe(true);
    expect(carriesCoachLabel("Ploy S.")).toBe(false);
    expect(carriesCoachLabel("Coachella")).toBe(false);
  });

  test("Thai \"Log it\" and \"Save\" are different words", () => {
    expect(th["log.save"].includes(th["session.log"])).toBe(false);
    expect(th["session.log"]).not.toBe(th["log.save"]);
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
