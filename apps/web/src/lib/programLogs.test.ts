import { describe, expect, test } from "bun:test";
import type { ProgramWeek, SignalProgram } from "@pt/shared";
import type { SessionLogDto } from "./api/types";
import { extraSets, logDateLabel, loggedSetLabel, programLogView, setsForExercise, timedIdsOfWeek } from "./programLogs";

const week = (n: number, sid: string, exId: string, timed = false): ProgramWeek => ({
  week: n,
  sessions: [
    {
      id: sid,
      name: "Upper",
      seq: 1,
      order: 0,
      weekday: 1,
      kind: "lifting",
      exercises: [
        {
          id: exId,
          exerciseId: "bench",
          order: 0,
          prescribedSets: [timed ? { setNumber: 1, type: "working", reps: 0, amrap: false, durationSeconds: 45 } : { setNumber: 1, type: "working", reps: 8, amrap: false }],
        },
      ],
    },
  ],
});

const program: SignalProgram = {
  id: "p1",
  clientId: "c1",
  name: "Week 1 – Week 2",
  status: "archived",
  weeks: [week(1, "s1", "e1"), week(2, "s2", "e2")],
  activatedAt: "2026-10-19T00:00:00.000Z",
  createdAt: "2026-11-09T00:00:00.000Z",
};

const log = (over: Partial<SessionLogDto>): SessionLogDto => ({
  id: crypto.randomUUID(),
  clientId: "c1",
  programId: "p1",
  programSessionId: null,
  date: "2026-10-19",
  kind: "lifting",
  notes: null,
  perceivedEnergy: null,
  sets: [],
  ...over,
});

describe("programLogView", () => {
  test("logs go on their session; others on their block week by date", () => {
    const a = log({ programSessionId: "s1", date: "2026-10-19" });
    const b = log({ programSessionId: "s2", date: "2026-10-26" });
    const free = log({ programSessionId: null, date: "2026-10-28" });
    const elsewhere = log({ programId: "p2", programSessionId: "s1" });
    const v = programLogView(program, [b, free, a, elsewhere]);
    expect(v.bySession.get("s1")).toEqual([a]);
    expect(v.bySession.get("s2")).toEqual([b]);
    expect(v.otherByWeek.get(1)).toEqual([free]);
    expect(v.total).toBe(3);
  });

  test("a date past the last week stays on the last week", () => {
    const late = log({ date: "2026-12-30" });
    expect(programLogView(program, [late]).otherByWeek.get(1)).toEqual([late]);
  });
});

describe("sets", () => {
  const sets: SessionLogDto["sets"] = [
    { programExerciseId: "e1", exerciseId: "bench", setNumber: 2, type: "working", weightKg: 62.5, reps: 8 },
    { programExerciseId: "e1", exerciseId: "bench", setNumber: 1, type: "working", weightKg: 60, reps: 8 },
    { programExerciseId: null, exerciseId: "row", setNumber: 1, type: "working", weightKg: 50, reps: 10 },
  ];

  test("by slot, in set order; unclaimed sets are extras", () => {
    const l = log({ sets });
    expect(setsForExercise(l, { id: "e1", exerciseId: "bench" }).map((s) => s.weightKg)).toEqual([60, 62.5]);
    expect(extraSets(l, [{ id: "e1", exerciseId: "bench" }]).map((s) => s.exerciseId)).toEqual(["row"]);
  });

  test("falls back to the catalog exercise when sets carry no slot", () => {
    const l = log({ sets: [{ ...sets[2] }] });
    expect(setsForExercise(l, { id: "x", exerciseId: "row" })).toHaveLength(1);
  });

  test("labels", () => {
    expect(loggedSetLabel({ weightKg: 62.5, reps: 8, rpe: null }, false)).toBe("62.5 kg × 8");
    expect(loggedSetLabel({ weightKg: null, reps: 10, rpe: 8 }, false)).toBe("BW × 10 @ 8");
    expect(loggedSetLabel({ weightKg: 12, reps: 60 }, true)).toBe("12 kg · 60 s");
    expect(loggedSetLabel({ weightKg: null, reps: 45 }, true)).toBe("45 s");
    expect(logDateLabel("2026-10-19")).toBe("Mon 19 Oct");
  });

  test("timed slots of a week", () => {
    const ids = timedIdsOfWeek(week(1, "s1", "e9", true));
    expect(ids.has("e9")).toBe(true);
    expect(timedIdsOfWeek(program.weeks[0]).has("e1")).toBe(false);
  });
});
