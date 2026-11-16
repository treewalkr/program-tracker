import { describe, expect, test } from "bun:test";
import type { PortalSession, PortalWeek } from "@pt/shared";
import { dateOfWeekday, dayGroups, focusSessionId } from "./week";

const S = (id: string, weekday: number | null, seq: number, log: PortalSession["log"] = null): PortalSession => ({
  id, name: id, kind: "lifting", seq, weekday, order: 0, exercises: [], cardio: null, log,
});
// a block week that starts on a Wednesday (2026-11-18)
const week = (sessions: PortalSession[]): PortalWeek => ({ week: 2, startDate: "2026-11-18", endDate: "2026-11-24", loggable: true, sessions });

describe("portal week", () => {
  test("weekdays land on their day inside a block week that starts mid-week", () => {
    expect(dateOfWeekday("2026-11-18", 3)).toBe("2026-11-18");
    expect(dateOfWeekday("2026-11-18", 1)).toBe("2026-11-23");
    expect(dateOfWeekday("2026-11-18", 7)).toBe("2026-11-22");
  });

  test("grouped in the block week's calendar order then any day, empty days dropped, today marked", () => {
    const g = dayGroups(week([S("fri", 5, 2), S("mon", 1, 1), S("any", null, 3)]), "2026-11-20");
    expect(g.map((d) => [d.weekday, d.date, d.isToday])).toEqual([
      [5, "2026-11-20", true],
      [1, "2026-11-23", false],
      [0, null, false],
    ]);
  });

  test("a Tue → Mon block week lists Tue 10 Nov before Mon 16 Nov", () => {
    const tueWeek: PortalWeek = { week: 1, startDate: "2026-11-10", endDate: "2026-11-16", loggable: true, sessions: [S("mon", 1, 1), S("tue", 2, 2), S("thu", 4, 3)] };
    expect(dayGroups(tueWeek, "2026-11-16").map((d) => d.date)).toEqual(["2026-11-10", "2026-11-12", "2026-11-16"]);
    // a week that starts on Monday keeps Mon → Sun
    const monWeek: PortalWeek = { ...tueWeek, startDate: "2026-11-16", endDate: "2026-11-22" };
    expect(dayGroups(monWeek, "2026-11-16").map((d) => d.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-19"]);
  });

  test("focus: today's open session, else the next open day, else any day", () => {
    const done = { id: "l", loggedBy: "client" as const, date: "2026-11-20" };
    expect(focusSessionId(week([S("mon", 1, 1), S("fri", 5, 2)]), "2026-11-20")).toBe("fri");
    expect(focusSessionId(week([S("mon", 1, 1), S("fri", 5, 2, done)]), "2026-11-20")).toBe("mon");
    expect(focusSessionId(week([S("fri", 5, 1, done), S("any", null, 2)]), "2026-11-20")).toBe("any");
    expect(focusSessionId(week([S("fri", 5, 1, done)]), "2026-11-20")).toBeNull();
    expect(focusSessionId({ ...week([S("mon", 1, 1)]), loggable: false }, "2026-11-20")).toBeNull();
  });
});
