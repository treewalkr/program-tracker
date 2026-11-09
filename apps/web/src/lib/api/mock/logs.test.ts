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
