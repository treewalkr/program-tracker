import { describe, expect, test } from "bun:test";
import type { Impersonator } from "$lib/api/auth";
import { VIEW_TEXT, confirmMatches, endedReason, firstName, minutesLeft, viewState } from "./viewAs";

const NOW = Date.parse("2026-11-18T10:00:00Z");
const at = (min: number) => new Date(NOW + min * 60_000).toISOString();
const view = (over: Partial<Impersonator> = {}): Impersonator => ({
  actor: { id: "a", name: "Boss", email: "b@x.test", avatarUrl: null },
  trainer: { id: "k", name: "Kai Tan", email: "k@x.test", avatarUrl: null },
  ticket: { id: "t", number: 12, handle: "FB-012" },
  until: at(24),
  writesUntil: null,
  ended: null,
  ...over,
});

describe("view as trainer", () => {
  test("minutes left round up and stop at 0", () => {
    expect(minutesLeft(at(24), NOW)).toBe(24);
    expect(minutesLeft(at(0.5), NOW)).toBe(1);
    expect(minutesLeft(at(0), NOW)).toBe(0);
    expect(minutesLeft(at(-3), NOW)).toBe(0);
  });

  test("read-only, edits on, or ended", () => {
    expect(viewState(view(), NOW)).toBe("read-only");
    expect(viewState(view({ writesUntil: at(9) }), NOW)).toBe("edits");
    expect(viewState(view({ writesUntil: at(-1) }), NOW)).toBe("read-only");
    expect(viewState(view({ until: at(-1) }), NOW)).toBe("ended");
    expect(viewState(view({ ended: "flag_off" }), NOW)).toBe("ended");
    expect(endedReason(view())).toBe("expired");
    expect(endedReason(view({ ended: "disabled" }))).toBe("disabled");
  });

  test("Allow edits wants the first name back, any case", () => {
    expect(firstName("Kai Tan")).toBe("Kai");
    expect(firstName("  Ploy  ")).toBe("Ploy");
    expect(confirmMatches(" kai ", "Kai Tan")).toBe(true);
    expect(confirmMatches("Kai Tan", "Kai Tan")).toBe(false);
    expect(confirmMatches("", "Kai Tan")).toBe(false);
  });

  test("both languages say the same things", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(VIEW_TEXT.th)).toEqual(keys(VIEW_TEXT.en));
    expect(VIEW_TEXT.en.minLeft(24)).toBe("24 min left");
    expect(VIEW_TEXT.th.minLeft(24)).toBe("เหลือ 24 นาที");
    expect(VIEW_TEXT.en.backTo("FB-012")).toBe("Back to FB-012");
    expect(VIEW_TEXT.en.backTo(null)).toBe("Back to Trainers");
  });
});
