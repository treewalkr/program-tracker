import { describe, expect, test } from "bun:test";
import { localDateOf, MEMBER_EDIT_CLEARS_REVIEW } from "@pt/shared";
import { mockApi, mockState } from "./api";
import { EXPIRED_TOKEN, SIGNED_IN_TOKEN, mockPortalApi, mockPortalProgress, mockPortalWeek } from "./portal";
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
    const exerciseSession = dto.weeks[0].sessions.find((s) => s.kind === "exercises")!;
    expect(exerciseSession.exercises[0].exerciseName).not.toMatch(/^ex-/);
  });

  test("log → done as the client → shows in the trainer's logs → undo", async () => {
    const session = mockPortalWeek().weeks[0].sessions.find((s) => s.kind === "exercises" && !s.log)!;
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

  test("editing a log the coach reviewed keeps the coach's note on both sides; the mark follows D5", async () => {
    const session = mockPortalWeek().weeks[0].sessions.find((s) => s.kind === "exercises" && !s.log)!;
    const ex = session.exercises[0];
    const body = (reps: number) => ({
      programSessionId: session.id,
      date: localDateOf(Date.now()),
      sets: [{ programExerciseId: ex.id, exerciseId: ex.exerciseId, setNumber: 1, type: "working" as const, reps }],
    });
    const first = await mockPortalApi.log(body(8));
    await mockApi.reviewSessionLog(first.id, { reviewed: true, feedback: "Good depth" });

    const edited = await mockPortalApi.log({ ...body(9), onDuplicate: "replace" });
    const entry = mockPortalWeek().weeks[0].sessions.find((s) => s.id === session.id)!.log!.entry!;
    expect(entry.trainerFeedback).toBe("Good depth");
    expect(entry.reviewedAt === null).toBe(MEMBER_EDIT_CLEARS_REVIEW);
    const trainerSees = (await mockApi.sessionLogs("cl-nat")).find((l) => l.id === edited.id)!;
    expect(trainerSees.trainerFeedback).toBe("Good depth");
    expect(trainerSees.reviewedBy === null).toBe(MEMBER_EDIT_CLEARS_REVIEW);
    await mockPortalApi.deleteLog(edited.id);
  });

  test("a session the coach logged reads back as a summary: figures and feedback, not the coach's notes", async () => {
    const dto = mockPortalWeek();
    const session = dto.weeks[0].sessions.find((s) => s.kind === "exercises" && !s.log)!;
    const program = mockState.programs.find((p) => p.id === dto.program!.id)!;
    const real = program.weeks.find((w) => w.week === dto.currentWeek)!.sessions.find((s) => s.name === session.name)!;
    const ex = session.exercises[0];
    const saved = await mockApi.logSession({
      clientId: "cl-nat",
      programId: program.id,
      programSessionId: real.id,
      date: localDateOf(Date.now()),
      notes: "coach only: watch the knee",
      perceivedEnergy: 3,
      sets: [{ programExerciseId: ex.id, exerciseId: ex.exerciseId, setNumber: 1, type: "working", weightKg: 90, reps: 6 }],
    });
    await mockApi.reviewSessionLog(saved.id, { reviewed: true, feedback: "Strong bar path." });
    const log = mockPortalWeek().weeks[0].sessions.find((s) => s.id === session.id)!.log!;
    expect(log.loggedBy).toBe("trainer");
    expect(log.entry).toMatchObject({
      sets: [{ programExerciseId: ex.id, setNumber: 1, weightKg: 90, reps: 6 }],
      notes: null,
      perceivedEnergy: null,
      trainerFeedback: "Strong bar path.",
    });
    // still the coach's: the member can neither replace nor remove it
    await expect(
      mockPortalApi.log({ programSessionId: session.id, date: localDateOf(Date.now()), onDuplicate: "replace", sets: [{ exerciseId: ex.exerciseId, setNumber: 1, type: "working", reps: 8 }] }),
    ).rejects.toBeInstanceOf(PortalDuplicateError);
    await expect(mockPortalApi.deleteLog(saved.id)).rejects.toBeDefined();
    mockState.logs = mockState.logs.filter((l) => l.sessionLogId !== saved.id);
  });

  test("a stale replace (it names a log that's since been replaced) is a 409 with the newer log, like the API", async () => {
    const session = mockPortalWeek().weeks[0].sessions.find((s) => s.kind === "exercises" && !s.log)!;
    const ex = session.exercises[0];
    const body = (reps: number) => ({
      programSessionId: session.id,
      date: localDateOf(Date.now()),
      sets: [{ programExerciseId: ex.id, exerciseId: ex.exerciseId, setNumber: 1, type: "working" as const, reps }],
    });
    const first = await mockPortalApi.log(body(8));
    const resend = await mockPortalApi.log({ ...body(9), onDuplicate: "replace", expectedLogId: first.id });
    const late = await mockPortalApi.log({ ...body(7), onDuplicate: "replace", expectedLogId: first.id }).catch((e) => e);
    expect(late).toBeInstanceOf(PortalDuplicateError);
    expect((late as PortalDuplicateError).existing).toMatchObject({ id: resend.id, loggedBy: "client" });
    const log = mockPortalWeek().weeks[0].sessions.find((s) => s.id === session.id)!.log!;
    expect([log.id, log.entry?.sets[0].reps]).toEqual([resend.id, 9]);
    await mockPortalApi.deleteLog(resend.id);
  });

  test("a client's low readiness and note show on the coach's Overview feed", async () => {
    const session = mockPortalWeek().weeks[0].sessions.find((s) => s.kind === "exercises" && !s.log)!;
    const ex = session.exercises[0];
    const saved = await mockPortalApi.log({
      programSessionId: session.id,
      date: localDateOf(Date.now()),
      readiness: { sleep: 1, soreness: 5 },
      notes: "Shoulder felt pinchy",
      sets: [{ programExerciseId: ex.id, exerciseId: ex.exerciseId, setNumber: 1, type: "working", reps: 8 }],
    });
    const feed = await mockApi.notifications();
    expect(feed.find((s) => s.kind === "low-readiness" && s.clientId === "cl-nat")?.evidence).toContain("sleep 1/5, soreness 5/5");
    expect(feed.find((s) => s.kind === "client-note" && s.clientId === "cl-nat")?.evidence).toContain("Shoulder felt pinchy");
    await mockPortalApi.deleteLog(saved.id);
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
    expect(await mockPortalApi.linkInfo("demo-nattapong")).toMatchObject({ trainerName: "Coach Ploy", signedIn: false });
    expect(await mockPortalApi.linkInfo(SIGNED_IN_TOKEN)).toMatchObject({ signedIn: true });
  });

  test("cardio demo: Nok's intervals with bpm from her HR zones, nothing of the profile itself", () => {
    const dto = mockPortalWeek(Date.now(), "cardio");
    expect(dto.program?.name).toBe("General Fitness — 8 wk");
    const run = dto.weeks[0].sessions.find((s) => s.cardio?.intervals?.length)!;
    expect(run.id).toMatch(/^ps-nok-\d$/);
    const work = run.cardio!.intervals!.find((iv) => iv.type === "work")!;
    expect(work.hrZone).toBe(4);
    expect(work.hrBpm?.min).toBeGreaterThan(100);
    const json = JSON.stringify(dto);
    for (const leak of ["restingHr", "lthr", "method", "zones", "modalityId", "maxHrTestedOn"]) expect(json).not.toContain(`"${leak}"`);
  });

  test("cardio demo progress: this week, recent cardio with the coach's feedback, a Cooper trend", async () => {
    const p = await mockPortalApi.progress(null);
    expect(p).toEqual(mockPortalProgress(Date.now(), null, null));
    const nok = mockPortalProgress(Date.now(), null, "cardio");
    expect(nok.recent.length).toBeGreaterThan(3);
    expect(nok.recent.some((l) => l.trainerFeedback?.includes("Zone 2"))).toBe(true);
    expect(nok.vo2.protocol).toBe("cooper_12min");
    expect(nok.vo2.points.length).toBe(3);
    expect(nok.target?.unit).toBe("session_load");
  });

  test("settings: metric by default, a saved choice comes back, junk is refused", async () => {
    expect((await mockPortalApi.settings()).units).toEqual({ weight: "kg", distance: "km" });
    expect((await mockPortalApi.saveSettings({ weight: "lb", distance: "mi" })).units).toEqual({ weight: "lb", distance: "mi" });
    await expect(mockPortalApi.saveSettings({ weight: "stone", distance: "km" } as never)).rejects.toThrow();
  });
});
