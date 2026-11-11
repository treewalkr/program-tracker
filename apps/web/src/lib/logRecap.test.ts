import { describe, expect, test } from "bun:test";
import type { ClientDto, ProgramDto, SessionLogDto } from "$lib/api/types";
import { toggleFlag } from "./logFlags";
import { nameList, nextToLog, recapCounts, recapNotes, saveRecap } from "./logRecap";
import { skipExercise, swapSlot, type SheetRow } from "./logSheet";
import { buildClientStrip, stripWeeks } from "./overview";

const row = (programExerciseId: string, setNumber: number, reps: number | "" = 5): SheetRow => ({
  key: `${programExerciseId}-${setNumber}`,
  exerciseId: `ex-${programExerciseId}`,
  slotExerciseId: `ex-${programExerciseId}`,
  programExerciseId,
  setNumber,
  type: "working",
  prescribedReps: 5,
  weight: 60,
  reps,
  rpe: "",
});

const names: Record<string, string> = { "ex-a": "Squat", "ex-b": "Bench", "ex-c": "Row", "ex-d": "Lunge", "ex-alt": "Goblet squat" };
const nameOf = (id: string) => names[id] ?? id;

describe("saveRecap", () => {
  test("counts the sets and exercises that went in", () => {
    const rows = [row("a", 1), row("a", 2), row("b", 1), row("b", 2, "")];
    const r = saveRecap(rows, {});
    expect(r.sets).toBe(4); // a blank reps cell logs as prescribed
    expect(r.exercises).toBe(2);
    expect(recapCounts(r)).toBe("4 sets · 2 exercises");
  });

  test("names skips, flags and swaps", () => {
    let rows = [row("a", 1), row("b", 1), row("c", 1)];
    rows = skipExercise(rows, "c");
    rows = swapSlot(rows, "a", "ex-alt");
    let flags = toggleFlag({}, "a", "pain");
    flags = toggleFlag(flags, "b", "technique");
    const r = saveRecap(rows, flags);
    expect(r).toMatchObject({ sets: 2, exercises: 2, skipped: ["ex-c"], pain: ["ex-alt"], technique: ["ex-b"], swapped: ["ex-alt"] });
    expect(recapNotes(r, nameOf)).toEqual([
      { tone: "bad", text: "Pain · Goblet squat" },
      { tone: "warn", text: "Technique · Bench" },
      { tone: "muted", text: "Skipped Row" },
      { tone: "muted", text: "Swapped in Goblet squat" },
    ]);
  });

  test("a clean save has nothing to note", () => {
    expect(recapNotes(saveRecap([row("a", 1)], {}), nameOf)).toEqual([]);
    expect(recapCounts({ sets: 1, exercises: 1 })).toBe("1 set · 1 exercise");
  });

  test("long lists stay a glance", () => {
    expect(nameList(["Squat"])).toBe("Squat");
    expect(nameList(["Squat", "Bench"])).toBe("Squat, Bench");
    expect(nameList(["Squat", "Bench", "Row", "Lunge"])).toBe("Squat, Bench and 2 more");
  });
});

describe("nextToLog", () => {
  // Wed 4 Nov 2026.
  const now = new Date(2026, 10, 4, 9, 30);
  const today = "2026-11-04";
  const weeks = stripWeeks(now, 1);
  const client = (id: string, name: string, status = "active") =>
    ({ id, name, status, sessionsPerWeek: 3, cardioTarget: null }) as unknown as ClientDto;
  const program = (weekday: number) =>
    ({
      id: "p1",
      name: "Base",
      weeks: [{ week: 1, sessions: [{ id: "s-wed", name: "Lower B", seq: 1, weekday, order: 0, kind: "lifting", exercises: [], cardio: null }] }],
      activatedAt: "2026-10-26T08:00:00.000Z",
      createdAt: "2026-10-01T00:00:00.000Z",
      phasing: null,
    }) as unknown as ProgramDto;
  const done = { id: "l1", clientId: "x", programId: "p1", programSessionId: "s-wed", date: today, kind: "lifting", sets: [] } as unknown as SessionLogDto;
  const strip = (c: ClientDto, weekday: number | null, logs: SessionLogDto[] = []) =>
    buildClientStrip(c, weekday == null ? null : program(weekday), logs, weeks, today);

  const ada = client("ada", "Ada");
  const ben = client("ben", "Ben");
  const cy = client("cy", "Cy");
  const dee = client("dee", "Dee");

  test("picks the next client in roster order with a session open today", () => {
    const strips = [strip(ada, 3), strip(ben, 2), strip(cy, 3), strip(dee, 3)];
    expect(nextToLog(strips, "ada", today)).toEqual({
      clientId: "cy",
      name: "Cy",
      session: "Lower B",
      href: `/clients/cy/log?session=s-wed&date=${today}`,
    });
  });

  test("wraps round the roster, never back to the client just logged", () => {
    const strips = [strip(ada, 3), strip(ben, 3), strip(cy, 3)];
    expect(nextToLog(strips, "cy", today)?.clientId).toBe("ada");
    expect(nextToLog([strip(ada, 3)], "ada", today)).toBeNull();
  });

  test("skips clients already logged today, resting, without a program or not active", () => {
    const strips = [
      strip(ada, 3),
      strip(ben, 3, [{ ...done, clientId: "ben" }]),
      strip(cy, null),
      strip(client("eve", "Eve", "paused"), 3),
      strip(dee, 5),
    ];
    expect(nextToLog(strips, "ada", today)).toBeNull();
  });
});
