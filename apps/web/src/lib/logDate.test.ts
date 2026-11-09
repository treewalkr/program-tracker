import { describe, expect, test } from "bun:test";
import {
  dateForSession,
  isoWeekday,
  openingPick,
  scheduledDate,
  sessionForDate,
  weekForDate,
  type DateLog,
  type DateProgram,
  type DateSession,
} from "./logDate";

// Anchor: activated Mon 2026-11-02. Week 1 = Nov 2–8, week 2 = Nov 9–15.
// Each week: A Mon, B Wed, C Fri, D "Any day".
const s = (id: string, weekday: number | null, seq: number): DateSession => ({ id, weekday, order: 0, kind: "lifting", seq });
const program: DateProgram = {
  id: "pg",
  activatedAt: "2026-11-02T03:00:00.000Z",
  createdAt: "2026-10-30T09:00:00.000Z",
  weeks: [1, 2].map((week) => ({
    week,
    sessions: [s(`d${week}`, null, 4), s(`c${week}`, 5, 3), s(`a${week}`, 1, 1), s(`b${week}`, 3, 2)],
  })),
};
const log = (programSessionId: string, date: string): DateLog => ({ programId: "pg", date, programSessionId });

describe("week windows", () => {
  test("weekdays and scheduled days inside the window", () => {
    expect(isoWeekday("2026-11-02")).toBe(1);
    expect(isoWeekday("2026-11-08")).toBe(7);
    expect(scheduledDate(program, [], 2, { weekday: 5 })).toBe("2026-11-13");
    expect(scheduledDate(program, [], 1, { weekday: null })).toBeNull();
  });

  test("a window that starts mid-week still holds each weekday once", () => {
    const thu = { ...program, activatedAt: "2026-11-05T08:00:00.000Z" };
    expect(scheduledDate(thu, [], 1, { weekday: 1 })).toBe("2026-11-09");
    expect(scheduledDate(thu, [], 1, { weekday: 5 })).toBe("2026-11-06");
  });
});

describe("sessionForDate", () => {
  test("an exact weekday match", () => {
    expect(sessionForDate(program, [], "2026-11-04")).toEqual({ week: 1, sessionId: "b1", why: "scheduled" });
    expect(sessionForDate(program, [], "2026-11-09")).toEqual({ week: 2, sessionId: "a2", why: "scheduled" });
  });

  test("a weekday already logged falls back to an open earlier session", () => {
    const logs = [log("b1", "2026-11-04")];
    expect(sessionForDate(program, logs, "2026-11-04")).toEqual({ week: 1, sessionId: "a1", why: "earlier" });
  });

  test("everything placed is logged: the open any-day session, then the logged weekday one", () => {
    const logs = [log("a1", "2026-11-02"), log("b1", "2026-11-04"), log("c1", "2026-11-06")];
    expect(sessionForDate(program, logs, "2026-11-04")).toEqual({ week: 1, sessionId: "d1", why: "any-day" });
    expect(sessionForDate(program, [...logs, log("d1", "2026-11-07")], "2026-11-04")).toEqual({ week: 1, sessionId: "b1", why: "logged" });
    expect(sessionForDate(program, [...logs, log("d1", "2026-11-07")], "2026-11-05")).toEqual({ week: 1, sessionId: "a1", why: "first" });
  });

  test("an off day picks the first open session earlier in the week", () => {
    const logs = [log("a1", "2026-11-02")];
    expect(sessionForDate(program, logs, "2026-11-05")).toEqual({ week: 1, sessionId: "b1", why: "earlier" });
  });

  test("a date before the anchor is week 1", () => {
    expect(weekForDate(program, [], "2026-10-28")).toBe(1);
    expect(sessionForDate(program, [], "2026-10-28")).toEqual({ week: 1, sessionId: "b1", why: "scheduled" });
  });

  test("a date past the last week clamps to it", () => {
    expect(weekForDate(program, [], "2026-11-25")).toBe(2);
    expect(sessionForDate(program, [], "2026-11-27")).toEqual({ week: 2, sessionId: "c2", why: "scheduled" });
  });

  test("a log before activation moves the anchor, and the windows with it", () => {
    const logs = [log("a1", "2026-10-26")];
    expect(weekForDate(program, logs, "2026-11-02")).toBe(2);
  });
});

describe("dateForSession", () => {
  test("the scheduled day in its week", () => {
    expect(dateForSession(program, [], 1, "b1", "2026-11-20")).toEqual({ date: "2026-11-04", scheduled: "2026-11-04", capped: false });
  });

  test("never in the future", () => {
    expect(dateForSession(program, [], 2, "c2", "2026-11-10")).toEqual({ date: "2026-11-10", scheduled: "2026-11-13", capped: true });
  });

  test("an any-day session keeps the current date", () => {
    expect(dateForSession(program, [], 1, "d1", "2026-11-10")).toBeNull();
    expect(dateForSession(program, [], 1, "nope", "2026-11-10")).toBeNull();
  });
});

describe("openingPick", () => {
  test("the most recent scheduled, unlogged session up to today", () => {
    const logs = [log("a2", "2026-11-09")];
    expect(openingPick(program, logs, "2026-11-12")).toEqual({ week: 2, sessionId: "b2", why: "scheduled", date: "2026-11-11" });
    expect(openingPick(program, [], "2026-11-09")).toEqual({ week: 2, sessionId: "a2", why: "scheduled", date: "2026-11-09" });
  });

  test("looks back across the week boundary", () => {
    const logs = [log("a1", "2026-11-02"), log("b1", "2026-11-04")];
    expect(openingPick(program, logs, "2026-11-08")).toMatchObject({ sessionId: "c1", date: "2026-11-06" });
  });

  test("nothing open in the last week: whatever today maps to", () => {
    const all = ["a1", "b1", "c1", "a2", "b2", "c2"].map((id) => log(id, "2026-11-02"));
    expect(openingPick(program, all, "2026-11-14")).toEqual({ week: 2, sessionId: "d2", why: "any-day", date: "2026-11-14" });
  });
});
