import { describe, expect, test } from "bun:test";
import { localDateOf } from "@pt/shared";
import { mockApi } from "./api";
import { EXPIRED_TOKEN, mockPortalApi, mockPortalWeek } from "./portal";
import { PortalDuplicateError } from "../portalTypes";

describe("mock portal (the demo client over the trainer mock)", () => {
  test("week: the active program's current and next week, nothing private", async () => {
    const dto = mockPortalWeek();
    expect(dto.program?.name).toBe("Sarcoplasmic Hypertrophy");
    const n = dto.currentWeek!;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(dto.weeks.map((w) => [w.week, w.loggable])).toEqual([
      [n, true],
      [n + 1, false],
    ]);
    const json = JSON.stringify(dto);
    for (const leak of ["direction", "phasing", "limitations", "goals", "oneRepMaxes", "percent1rm", "role"]) {
      expect(json).not.toContain(`"${leak}"`);
    }
    const lifting = dto.weeks[0].sessions.find((s) => s.kind === "lifting")!;
    expect(lifting.exercises[0].exerciseName).not.toMatch(/^ex-/);
  });

  test("log → done as the client → shows in the trainer's logs → undo", async () => {
    const session = mockPortalWeek().weeks[0].sessions.find((s) => s.kind === "lifting" && !s.log)!;
    const ex = session.exercises[0];
    const saved = await mockPortalApi.log({
      programSessionId: session.id,
      date: localDateOf(Date.now()),
      sets: [{ programExerciseId: ex.id, exerciseId: ex.exerciseId, setNumber: 1, type: "working", reps: 8 }],
    });
    expect(saved.loggedBy).toBe("client");
    expect(mockPortalWeek().weeks[0].sessions.find((s) => s.id === session.id)!.log).toMatchObject({ id: saved.id, loggedBy: "client" });
    const trainerSees = await mockApi.sessionLogs("cl-nat");
    expect(trainerSees.find((l) => l.id === saved.id)?.loggedBy).toBe("client");

    await expect(
      mockPortalApi.log({ programSessionId: session.id, date: localDateOf(Date.now()), sets: [{ exerciseId: ex.exerciseId, setNumber: 1, type: "working", reps: 8 }] }),
    ).rejects.toBeInstanceOf(PortalDuplicateError);

    await mockPortalApi.deleteLog(saved.id);
    expect(mockPortalWeek().weeks[0].sessions.find((s) => s.id === session.id)!.log).toBeNull();
  });

  test("next week's sessions can't be logged", async () => {
    const next = mockPortalWeek().weeks[1].sessions[0];
    await expect(
      mockPortalApi.log({ programSessionId: next.id, date: localDateOf(Date.now()), sets: [] }),
    ).rejects.toMatchObject({ status: 422 });
  });

  test("demo ids are stable: ps-nat-<n> this week, ps-nat-next-<n> next week", () => {
    const [now, next] = mockPortalWeek().weeks;
    expect(now.sessions.map((s) => s.id)).toEqual(now.sessions.map((_, i) => `ps-nat-${i + 1}`));
    expect(new Set(now.sessions.map((s) => s.id)).size).toBe(now.sessions.length);
    expect(next.sessions.every((s) => s.id.startsWith("ps-nat-next-"))).toBe(true);
    expect(mockPortalWeek().weeks[0].sessions.map((s) => s.id)).toEqual(now.sessions.map((s) => s.id));
  });

  test("demo states: no program yet, a week that started 3 days ago, a dead link", async () => {
    expect(mockPortalWeek(Date.now(), "empty")).toEqual({ program: null, currentWeek: null, weeks: [] });
    const today = localDateOf(Date.now());
    const mid = mockPortalWeek(Date.now(), "midweek").weeks[0];
    expect(mid.startDate < today).toBe(true);
    expect(await mockPortalApi.linkInfo(EXPIRED_TOKEN)).toBeNull();
    expect(await mockPortalApi.linkInfo("demo-nattapong")).toMatchObject({ trainerName: "Coach Ploy" });
  });
});
