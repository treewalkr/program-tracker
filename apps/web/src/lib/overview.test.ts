import { expect, test } from "bun:test";
import type { ClientDto, ProgramDto, SessionLogDto } from "$lib/api/types";
import {
  buildClientStrip,
  dayDateLabel,
  daySentence,
  volumeLabel,
  exceptionOrder,
  localIso,
  plural,
  stripWeeks,
  weekDatesOf,
  weekRangeLabel,
  weekTally,
  type ClientStrip,
} from "./overview";

const client = { id: "c1", name: "Ada", status: "active", sessionsPerWeek: 3, cardioTarget: null } as unknown as ClientDto;
const session = (id: string, weekday: number | null, seq: number) => ({
  id, name: `Session ${seq}`, seq, weekday, order: 0, kind: "lifting", exercises: [], cardio: null,
});
const program = (sessions: ReturnType<typeof session>[]) =>
  ({ id: "p1", name: "Base", weeks: [{ week: 1, sessions }], activatedAt: "2026-10-26T08:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z", phasing: null }) as unknown as ProgramDto;
const set = (weightKg: number | null, reps: number) => ({ exerciseId: "squat", setNumber: 1, type: "working", weightKg, reps });
const log = (date: string, programSessionId: string | null, sets = [set(100, 5)], programId = "p1") =>
  ({ id: `${date}-${programSessionId}`, clientId: "c1", programId, programSessionId, date, kind: "lifting", sets }) as unknown as SessionLogDto;

// Mon 2 – Sun 8 Nov 2026; "today" is Wed 4.
const week = weekDatesOf(new Date(2026, 10, 4, 1, 30));
const weeks = stripWeeks(new Date(2026, 10, 4, 1, 30));
const current = (s: ClientStrip) => s.weeks[s.weeks.length - 1];
const day = (s: ClientStrip, iso: string) => s.weeks.flat().find((d) => d.date === iso)!;

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

test("the strip covers six calendar weeks, oldest first, ending with this week", () => {
  expect(weeks).toHaveLength(6);
  expect(weeks[0][0]).toBe("2026-09-28");
  expect(weeks[5]).toEqual(week);
});

test("a session logged on another day of the week still counts as done", () => {
  const s = buildClientStrip(client, program([session("a", 1, 1), session("b", 3, 2), session("c", 5, 3)]), [log("2026-11-03", "a")], weeks, "2026-11-04");
  expect([0, 2, 4].map((i) => current(s)[i].status)).toEqual(["logged", "today", "upcoming"]);
  expect(current(s)[0].sessions[0]).toMatchObject({ name: "Session 1", status: "logged", loggedOn: "2026-11-03" });
});

test("an unlogged past day is missed; a log without a session id matches by date", () => {
  const s = buildClientStrip(client, program([session("a", 1, 1), session("b", 2, 2)]), [log("2026-11-03", null)], weeks, "2026-11-04");
  expect(current(s)[0].status).toBe("missed");
  expect(current(s)[1].status).toBe("logged");
});

test("any-day sessions get no cell but are counted", () => {
  const s = buildClientStrip(client, program([session("a", null, 1), session("b", null, 2)]), [], weeks, "2026-11-04");
  expect(current(s).every((d) => d.status === "rest")).toBe(true);
  expect(s.unscheduled).toBe(2);
  expect(s.program).toBe("Base");
  expect(s.exception).toBe("on-track");
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

test("a log picked against another program week's session counts by its calendar date (F08)", () => {
  const s = buildClientStrip(client, multiWeek("2026-11-02T08:00:00.000Z"), [log("2026-11-02", "w3a"), log("2026-11-04", "w3b")], weeks, "2026-11-05");
  expect([0, 2, 4].map((i) => current(s)[i].status)).toEqual(["logged", "logged", "upcoming"]);
});

test("days before the block started are never missed (F07)", () => {
  const s = buildClientStrip(client, multiWeek("2026-11-04T08:00:00.000Z"), [], weeks, "2026-11-05");
  expect(current(s)[0].status).toBe("before-start");
  expect(current(s)[0].sessions).toEqual([]);
  expect(current(s)[2].status).toBe("missed");
});

test("days before the client was created are never missed, but backfilled logs still show", () => {
  const newClient = { ...client, createdAt: "2026-11-04T03:00:00.000Z" } as ClientDto;
  const p = multiWeek("2026-10-26T08:00:00.000Z");
  expect(current(buildClientStrip(newClient, p, [], weeks, "2026-11-05"))[0].status).toBe("before-start");
  expect(current(buildClientStrip(newClient, p, [log("2026-11-02", null)], weeks, "2026-11-05"))[0].status).toBe("logged");
});

test("a cell opens the first session on the day not logged yet", () => {
  const p = program([session("a", 1, 1), session("b", 1, 2), session("c", 3, 3)]);
  const s = buildClientStrip(client, p, [log("2026-11-02", "a")], weeks, "2026-11-04");
  expect(current(s)[0].openSessionId).toBe("b");
  expect(current(s)[0].status).toBe("missed");
  expect(current(s)[2].openSessionId).toBe("c");
});

test("history weeks mark missed sessions after the block started", () => {
  // Activated Mon 26 Oct (block week 1 = that calendar week); Monday of it was skipped.
  const s = buildClientStrip(client, multiWeek("2026-10-26T08:00:00.000Z"), [log("2026-10-28", "w1b")], weeks, "2026-11-04");
  expect(day(s, "2026-10-26").status).toBe("missed");
  expect(day(s, "2026-10-26").sessions[0].id).toBe("w1a");
  expect(day(s, "2026-10-28").status).toBe("logged");
});

test("weeks before the current program are logged-only: old-program logs show, nothing is missed", () => {
  const s = buildClientStrip(client, multiWeek("2026-10-26T08:00:00.000Z"), [log("2026-10-12", "old-1", [set(80, 5)], "p0")], weeks, "2026-11-04");
  expect(day(s, "2026-10-12").status).toBe("logged");
  expect(day(s, "2026-10-12").sessions).toEqual([{ id: null, name: "Logged session", status: "logged", planned: false }]);
  expect(day(s, "2026-10-14").status).toBe("before-start");
  expect(s.weeks.flat().some((d) => d.date < "2026-10-26" && d.status === "missed")).toBe(false);
});

test("logged days are shaded 1–4 against the client's usual day", () => {
  const logs = [
    log("2026-10-05", null, [set(100, 5)]),
    log("2026-10-12", null, [set(100, 5)]),
    log("2026-10-19", null, [set(100, 5)]),
    log("2026-10-26", null, [set(100, 5)]),
    log("2026-11-02", null, [set(100, 20)]),
    log("2026-10-07", null, [set(20, 5)]),
  ];
  const s = buildClientStrip(client, null, logs, weeks, "2026-11-04");
  expect(day(s, "2026-10-05")).toMatchObject({ level: 3, volume: { basis: "tonnage", amount: 500 } });
  expect(day(s, "2026-11-02").level).toBe(4);
  expect(day(s, "2026-10-07").level).toBe(1);
  expect(day(s, "2026-10-06")).toMatchObject({ status: "rest", level: 0, volume: null });
});

test("a planned day done on another day still reads as logged (level ≥ 1)", () => {
  const s = buildClientStrip(client, program([session("a", 1, 1)]), [log("2026-11-03", "a")], weeks, "2026-11-04");
  expect(current(s)[0]).toMatchObject({ status: "logged", volume: null });
  expect(current(s)[0].level).toBeGreaterThanOrEqual(1);
});

test("an unplanned log on a rest day is listed as an extra session", () => {
  const p = program([session("a", 1, 1)]);
  const s = buildClientStrip(client, p, [log("2026-11-03", "a")], weeks, "2026-11-04");
  expect(current(s)[1].sessions).toEqual([{ id: "a", name: "Session 1", status: "logged", planned: false }]);
});

test("exception per client: missed → today → on track → none", () => {
  const p = program([session("a", 1, 1), session("b", 3, 2), session("c", 5, 3)]);
  expect(buildClientStrip(client, p, [], weeks, "2026-11-04").exception).toBe("missed");
  expect(buildClientStrip(client, p, [log("2026-11-02", "a")], weeks, "2026-11-04").exception).toBe("today");
  expect(buildClientStrip(client, p, [log("2026-11-02", "a"), log("2026-11-04", "b")], weeks, "2026-11-04").exception).toBe("on-track");
  expect(buildClientStrip(client, null, [], weeks, "2026-11-04").exception).toBe("none");
});

test("exception order sorts missed first and keeps roster order within a group", () => {
  const strip = (id: string, exception: ClientStrip["exception"]) => ({ client: { id }, exception }) as unknown as ClientStrip;
  const sorted = exceptionOrder([strip("a", "none"), strip("b", "on-track"), strip("c", "missed"), strip("d", "today"), strip("e", "missed")]);
  expect(sorted.map((s) => s.client.id)).toEqual(["c", "e", "d", "b", "a"]);
});

test("week tally counts this week's planned sessions only", () => {
  const p = program([session("a", 1, 1), session("b", 3, 2), session("c", 5, 3)]);
  const s = buildClientStrip(client, p, [log("2026-11-03", null)], weeks, "2026-11-04");
  expect(weekTally([s])).toEqual({ logged: 0, planned: 3, dueToday: 1, missed: 1 });
});

test("labels read as full sentences", () => {
  expect(dayDateLabel("2026-11-02")).toBe("Mon, Nov 2");
  expect(volumeLabel({ basis: "tonnage", amount: 4250 })).toBe("4,250 kg");
  expect(volumeLabel({ basis: "sets", amount: 1 })).toBe("1 set");
  const s = buildClientStrip(client, program([session("a", 1, 1), session("b", 3, 2)]), [log("2026-11-02", "a"), log("2026-11-03", "b")], weeks, "2026-11-04");
  expect(daySentence("Ada", current(s)[0])).toBe("Ada, Monday, Nov 2: Session 1 logged — 500 kg, usual day.");
  expect(daySentence("Ada", current(s)[2])).toBe("Ada, Wednesday, Nov 4: Session 2 logged Tue, Nov 3.");
});
