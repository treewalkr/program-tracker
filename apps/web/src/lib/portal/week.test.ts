import { describe, expect, test } from "bun:test";
import type { PortalSession, PortalWeek } from "@pt/shared";
import { calendarDays, dateOfWeekday, dayGroups, doneCount, earlierOpen, focusSession, focusSessionId, lastWeekOpen, skippedCount } from "./week";

const S = (id: string, weekday: number | null, seq: number, log: PortalSession["log"] = null): PortalSession => ({
  id, name: id, kind: "exercises", seq, weekday, order: 0, exercises: [], cardio: null, log,
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

  test("earlier this week: past days with open sessions, focus left out", () => {
    const done = { id: "l", loggedBy: "client" as const, date: "2026-11-19" };
    // Wed 18 … Tue 24; today Fri 20
    const w = week([S("wed", 3, 1), S("thu", 4, 2, done), S("thu2", 4, 3), S("fri", 5, 4), S("mon", 1, 5), S("any", null, 6)]);
    expect(earlierOpen(w, "2026-11-20").map((g) => [g.date, g.sessions.map((s) => s.id)])).toEqual([
      ["2026-11-18", ["wed"]],
      ["2026-11-19", ["thu2"]],
    ]);
    expect(earlierOpen(w, "2026-11-20", "wed").map((g) => g.date)).toEqual(["2026-11-19"]);
    expect(earlierOpen({ ...w, loggable: false }, "2026-11-20")).toEqual([]);
    expect(focusSession(w, "2026-11-20")?.id).toBe("fri");
  });

  test("the calendar leaves out what Next up and Earlier already show, and days left empty", () => {
    const done = { id: "l1", loggedBy: "client" as const, date: "2026-11-19" };
    const w = week([S("wed", 3, 1), S("thu", 4, 2, done), S("thu2", 4, 3), S("fri", 5, 4), S("mon", 1, 5)]);
    const shown = calendarDays(w, "2026-11-20", ["fri", ...earlierOpen(w, "2026-11-20", "fri").flatMap((g) => g.sessions.map((s) => s.id))]);
    expect(shown.map((g) => [g.date, g.sessions.map((s) => s.id)])).toEqual([
      ["2026-11-19", ["thu"]],
      ["2026-11-23", ["mon"]],
    ]);
  });
});

describe("done and skipped", () => {
  test("a skipped cardio log resolves the session but isn't done", () => {
    const w = week([
      S("a", 1, 1, { id: "l1", loggedBy: "client", date: "2026-11-18" }),
      S("b", 2, 2, { id: "l2", loggedBy: "client", date: "2026-11-19", skipped: true }),
      S("c", 3, 3, { id: "l3", loggedBy: "trainer", date: "2026-11-19", skipped: true }),
      S("d", 4, 4),
    ]);
    expect(doneCount(w)).toBe(1);
    expect(skippedCount(w)).toBe(2);
    // and it's not open either: focus moves past it
    expect(focusSessionId(w, "2026-11-18")).toBe("d");
  });
});

describe("last week's catch-up", () => {
  const last = (sessions: PortalSession[]): PortalWeek => ({ week: 1, startDate: "2026-11-16", endDate: "2026-11-22", loggable: true, sessions });

  test("open sessions by their day in last week, any day last, logged ones left out", () => {
    const done = { id: "l", loggedBy: "client" as const, date: "2026-11-18" };
    const g = lastWeekOpen(last([S("sun", 7, 3), S("wed", 3, 2, done), S("mon", 1, 1), S("any", null, 4)]), "2026-11-23");
    expect(g.map((d) => [d.date, d.isToday, d.sessions.map((s) => s.id)])).toEqual([
      ["2026-11-16", false, ["mon"]],
      ["2026-11-22", false, ["sun"]],
      [null, false, ["any"]],
    ]);
  });

  test("nothing without a last week, or when all of it is logged", () => {
    const done = { id: "l", loggedBy: "client" as const, date: "2026-11-18" };
    expect(lastWeekOpen(null, "2026-11-23")).toEqual([]);
    expect(lastWeekOpen(undefined, "2026-11-23")).toEqual([]);
    expect(lastWeekOpen(last([S("wed", 3, 1, done)]), "2026-11-23")).toEqual([]);
  });
});
