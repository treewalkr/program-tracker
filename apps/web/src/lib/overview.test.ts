import { expect, test } from "bun:test";
import type { ClientDto, ProgramDto, SessionLogDto } from "$lib/api/types";
import { buildWeekRow, localIso, plural, weekDatesOf, weekRangeLabel } from "./overview";

const client = { id: "c1", name: "Ada", status: "active", sessionsPerWeek: 3, cardioTarget: null } as unknown as ClientDto;
const session = (id: string, weekday: number | null, seq: number) => ({
  id, name: `Session ${seq}`, seq, weekday, order: 0, kind: "lifting", exercises: [], cardio: null,
});
const program = (sessions: ReturnType<typeof session>[]) =>
  ({ id: "p1", name: "Base", weeks: [{ week: 1, sessions }], activatedAt: "2026-10-26T08:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z", phasing: null }) as unknown as ProgramDto;
const log = (date: string, programSessionId: string | null) =>
  ({ id: date, clientId: "c1", programId: "p1", programSessionId, date, kind: "lifting", sets: [] }) as unknown as SessionLogDto;

// Mon 2 – Sun 8 Nov 2026; "today" is Wed 4.
const week = weekDatesOf(new Date(2026, 10, 4, 1, 30));

test("week dates are local calendar days even right after midnight", () => {
  expect(week).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  expect(localIso(new Date(2026, 10, 4, 0, 5))).toBe("2026-11-04");
});

test("range label carries the month and handles a month boundary", () => {
  expect(weekRangeLabel(week)).toBe("Nov 2–8");
  expect(weekRangeLabel(weekDatesOf(new Date(2026, 10, 1)))).toBe("Oct 26 – Nov 1");
});

test("plural", () => {
  expect(plural(1, "client")).toBe("1 client");
  expect(plural(3, "signal")).toBe("3 signals");
});

test("a session logged on another day of the week still counts as done", () => {
  const row = buildWeekRow(client, program([session("a", 1, 1), session("b", 3, 2), session("c", 5, 3)]), [log("2026-11-03", "a")], week, "2026-11-04");
  expect([1, 3, 5].map((d) => row.entries.get(d)?.status)).toEqual(["logged", "today", "upcoming"]);
});

test("an unlogged past day is due (missed); a log without a session id matches by date", () => {
  const row = buildWeekRow(client, program([session("a", 1, 1), session("b", 2, 2)]), [log("2026-11-03", null)], week, "2026-11-04");
  expect(row.entries.get(1)?.status).toBe("due");
  expect(row.entries.get(2)?.status).toBe("logged");
});

test("any-day sessions get no cell but are counted", () => {
  const row = buildWeekRow(client, program([session("a", null, 1), session("b", null, 2)]), [], week, "2026-11-04");
  expect(row.entries.size).toBe(0);
  expect(row.unscheduled).toBe(2);
  expect(row.program).toBe("Base");
});

// A 3-week program: same three slots each week, ids differ per week.
const multiWeek = (activatedAt: string) =>
  ({
    id: "p1",
    name: "Base",
    weeks: [1, 2, 3].map((w) => ({
      week: w,
      sessions: [session(`w${w}a`, 1, 1), session(`w${w}b`, 3, 2), session(`w${w}c`, 5, 3)],
    })),
    activatedAt,
    createdAt: "2026-10-01T00:00:00.000Z",
    phasing: null,
  }) as unknown as ProgramDto;
const NOV5 = new Date(2026, 10, 5, 12).getTime();

test("a log picked against another program week's session counts by its calendar date (F08)", () => {
  // Block week 1 is current, but Monday was logged against week 3's Session 1.
  const row = buildWeekRow(client, multiWeek("2026-11-02T08:00:00.000Z"), [log("2026-11-02", "w3a"), log("2026-11-04", "w3b")], week, "2026-11-05", NOV5);
  expect([1, 3, 5].map((d) => row.entries.get(d)?.status)).toEqual(["logged", "logged", "upcoming"]);
});

test("days before the block started are never missed (F07)", () => {
  // Activated Wednesday: Monday's slot gets no cell; Wednesday's is missed.
  const row = buildWeekRow(client, multiWeek("2026-11-04T08:00:00.000Z"), [], week, "2026-11-05", NOV5);
  expect(row.entries.has(1)).toBe(false);
  expect(row.entries.get(3)?.status).toBe("due");
});

test("days before the client was created are never missed, but backfilled logs still show", () => {
  const newClient = { ...client, createdAt: "2026-11-04T03:00:00.000Z" } as ClientDto;
  const p = multiWeek("2026-10-26T08:00:00.000Z");
  expect(buildWeekRow(newClient, p, [], week, "2026-11-05", NOV5).entries.has(1)).toBe(false);
  expect(buildWeekRow(newClient, p, [log("2026-11-02", null)], week, "2026-11-05", NOV5).entries.get(1)?.status).toBe("logged");
});

test("a cell names the session it opens: the first one on the day not logged yet", () => {
  const p = program([session("a", 1, 1), session("b", 1, 2), session("c", 3, 3)]);
  const row = buildWeekRow(client, p, [log("2026-11-02", "a")], week, "2026-11-04");
  expect(row.entries.get(1)?.sessionId).toBe("b");
  expect(row.entries.get(3)?.sessionId).toBe("c");
});
