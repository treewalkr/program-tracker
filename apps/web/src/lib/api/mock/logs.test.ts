import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";
import { DuplicateLogError, type SessionLogInput } from "../types";

const base = async (): Promise<SessionLogInput> => {
  const c = await mockApi.createClient({ name: "ZZ-TEST Dupes", email: "zz-dupes@example.com", goals: null, limitations: null, sessionsPerWeek: null });
  return {
    clientId: c.id,
    programId: "pg-zz-dupes",
    programSessionId: "ps-zz-dupes",
    date: "2026-11-07",
    sets: [{ exerciseId: "ex-squat", setNumber: 1, type: "working", weightKg: 100, reps: 5 }],
  };
};

const mine = (input: SessionLogInput) =>
  mockApi.sessionLogs(input.clientId, input.programId).then((ls) => ls.filter((l) => l.programSessionId === input.programSessionId));

describe("mockApi session log duplicates", () => {
  test("logSession returns the saved log with its id", async () => {
    const input = await base();
    const saved = await mockApi.logSession(input);
    expect(saved.id).toBeString();
    expect(saved.sets).toHaveLength(1);
    expect((await mine(input)).map((l) => l.id)).toEqual([saved.id]);
  });

  test("the same session again throws DuplicateLogError with the existing log", async () => {
    const input = await base();
    const first = await mockApi.logSession(input);
    const err = await mockApi.logSession(input).catch((e) => e);
    expect(err).toBeInstanceOf(DuplicateLogError);
    expect(err.existing).toEqual({ id: first.id, date: "2026-11-07", setCount: 1 });
    expect(await mine(input)).toHaveLength(1);
  });

  test("a log without a program session is never a duplicate", async () => {
    const input = { ...(await base()), programSessionId: null };
    await mockApi.logSession(input);
    await mockApi.logSession(input);
    expect((await mockApi.sessionLogs(input.clientId)).length).toBe(2);
  });

  test("add keeps both; replace leaves only the new log", async () => {
    const input = await base();
    await mockApi.logSession(input);
    await mockApi.logSession({ ...input, onDuplicate: "add" });
    expect(await mine(input)).toHaveLength(2);
    const replaced = await mockApi.logSession({
      ...input,
      onDuplicate: "replace",
      sets: [
        { exerciseId: "ex-squat", setNumber: 1, type: "working", weightKg: 105, reps: 5 },
        { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 105, reps: 4 },
      ],
    });
    const left = await mine(input);
    expect(left.map((l) => l.id)).toEqual([replaced.id]);
    expect(left[0].sets.map((s) => s.reps)).toEqual([5, 4]);
  });

  test("deleteSessionLog removes the log; a second delete throws", async () => {
    const input = await base();
    const saved = await mockApi.logSession(input);
    await mockApi.deleteSessionLog(saved.id);
    expect(await mine(input)).toHaveLength(0);
    expect(mockApi.deleteSessionLog(saved.id)).rejects.toThrow("log not found");
  });
});

describe("mockApi session log readiness and flags", () => {
  const pain = { programExerciseId: null, exerciseId: "ex-squat", kind: "pain" as const, note: "knee twinge" };

  test("stores and returns readiness and flags; empty ones read as null", async () => {
    const input = { ...(await base()), programSessionId: null };
    const saved = await mockApi.logSession({ ...input, readiness: { sleep: 2, soreness: 4 }, flags: [pain] });
    expect(saved.readiness).toEqual({ sleep: 2, soreness: 4 });
    expect(saved.flags).toEqual([pain]);
    const plain = await mockApi.logSession({ ...input, readiness: {}, flags: [] });
    expect(plain.readiness).toBeNull();
    expect(plain.flags).toBeNull();
    const listed = await mockApi.sessionLogs(input.clientId);
    expect(listed.find((l) => l.id === saved.id)?.flags).toEqual([pain]);
    expect(listed.find((l) => l.id === plain.id)?.readiness).toBeNull();
  });

  test("replace carries the new log's readiness and flags; delete drops them", async () => {
    const input = await base();
    await mockApi.logSession({ ...input, readiness: { sleep: 5 } });
    const replaced = await mockApi.logSession({ ...input, onDuplicate: "replace", readiness: { soreness: 3 }, flags: [pain] });
    const left = await mine(input);
    expect(left).toHaveLength(1);
    expect(left[0].readiness).toEqual({ soreness: 3 });
    expect(left[0].flags).toEqual([pain]);
    await mockApi.deleteSessionLog(replaced.id);
    expect(await mine(input)).toHaveLength(0);
  });

  test("a pain flag shows as a pain-flag signal on the Overview feed", async () => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const input = { ...(await base()), programSessionId: null, date };
    await mockApi.logSession({ ...input, flags: [pain] });
    const signals = await mockApi.notifications();
    const signal = signals.find((s) => s.kind === "pain-flag" && s.clientId === input.clientId);
    expect(signal?.id).toBe(`pain-flag:${input.clientId}:ex-squat:${date}`);
    expect(signal?.evidence).toContain("“knee twinge”");
  });
});
