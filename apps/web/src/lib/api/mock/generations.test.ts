import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

describe("mockApi generation and cancellation", () => {
  test("mock generate goes pending-first and can be cancelled during delay", async () => {
    const promise = mockApi.generate({
      clientId: "cl-maya",
      instructions: "test cancel",
    });

    const gens = await mockApi.generations("cl-maya");
    const pending = gens.find((g) => g.status === "pending");
    expect(pending).toBeDefined();
    expect(pending?.draft).toBeNull();

    const cancelled = await mockApi.cancelGeneration(pending!.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.draft).toBeNull();

    const result = await promise;
    expect(result.status).toBe("cancelled");
    expect(result.draft).toBeNull();

    const refreshed = await mockApi.generation(pending!.id);
    expect(refreshed.status).toBe("cancelled");
    expect(refreshed.draft).toBeNull();
  });

  test("mock cancelGeneration guards: 404 for unknown, 409 for non-pending", async () => {
    await expect(mockApi.cancelGeneration("non-existent")).rejects.toThrow("generation not found");

    const validated = (await mockApi.generations("cl-maya")).find((g) => g.status === "validated");
    if (validated) {
      await expect(mockApi.cancelGeneration(validated.id)).rejects.toThrow("generation is validated, not pending");
    }
  });
});

describe("mockApi approval places sessions like the API", () => {
  test("block approval: seq per kind in draft order, placed on the client's days", async () => {
    const gen = await mockApi.generate({ clientId: "cl-maya", providerId: "mock" });
    const program = await mockApi.approveGeneration(gen.id);
    const week1 = program.weeks[0].sessions;
    expect(week1.map((s) => `${s.kind}:${s.seq}`)).toEqual(["lifting:1", "lifting:2", "lifting:3", "lifting:4"]);
    const client = (await mockApi.client("cl-maya")).client;
    for (const s of week1) expect(client.trainingDays).toContain(s.weekday!);
    // every week shares week 1's placement
    for (const w of program.weeks) {
      expect(w.sessions.map((s) => s.weekday)).toEqual(week1.map((s) => s.weekday));
    }
  });

  test("week approval keeps the old placement by session key; new sessions are unscheduled", async () => {
    const before = await mockApi.program("pg-maya-a");
    const oldAt = new Map(before.weeks[2].sessions.map((s) => [`${s.kind}:${s.seq}`, s.weekday ?? null]));
    const gen = await mockApi.generate({ clientId: "cl-maya", providerId: "mock", basedOnProgramId: "pg-maya-a", targetWeek: 3 });
    const after = await mockApi.approveGeneration(gen.id);
    const week3 = after.weeks.find((w) => w.week === 3)!.sessions;
    for (const s of week3) {
      const key = `${s.kind}:${s.seq}`;
      expect(s.weekday ?? null).toBe(oldAt.has(key) ? oldAt.get(key)! : null);
    }
  });
});

describe("mock seed programs", () => {
  test("Maya's block has a stacked weekday and an unscheduled session", async () => {
    const p = await mockApi.program("pg-maya-a");
    const w1 = p.weeks[0].sessions;
    const perDay = new Map<number, number>();
    for (const s of w1) if (s.weekday != null) perDay.set(s.weekday, (perDay.get(s.weekday) ?? 0) + 1);
    expect([...perDay.values()].some((n) => n >= 2)).toBe(true);
    expect(w1.some((s) => s.weekday == null)).toBe(true);
  });
});

describe("mockApi fill (FB-013)", () => {
  test("A/B: W1 and W2 stay the trainer's, W3–W6 are written from them on approve", async () => {
    const wk = (week: number) => ({
      week,
      rotation: week % 2 ? ("A" as const) : ("B" as const),
      sessions: [{ id: crypto.randomUUID(), name: "Lower", seq: 1, order: 0, kind: "lifting" as const, weekday: 1,
        exercises: [{ id: crypto.randomUUID(), exerciseId: week % 2 ? "ex-squat" : "ex-dead", order: 0, prescribedSets: [{ setNumber: 1, type: "working" as const, reps: 5, amrap: false, targetWeightKg: 100 }] }] }],
    });
    const before = await mockApi.createProgram({ clientId: "cl-maya", name: "Fill me", weeks: [1, 2, 3, 4, 5, 6].map(wk) });
    const gen = await mockApi.fillProgram({ clientId: "cl-maya", programId: before.id, providerId: "mock" });
    expect(gen.kind).toBe("fill");
    expect(gen.draft!.weeks.map((w) => `${w.week}${w.rotation}${w.locked ? "*" : ""}`)).toEqual(["1A*", "2B*", "3A", "4B", "5A", "6B"]);
    expect(gen.draft!.weeks[3].sessions[0].exercises[0].exerciseId).toBe("ex-dead");
    const after = await mockApi.approveGeneration(gen.id);
    expect(after.weeks[0]).toEqual(before.weeks[0]);
    expect(after.weeks[1]).toEqual(before.weeks[1]);
    expect(after.weeks[2].sessions[0].exercises[0].prescribedSets[0].targetWeightKg).toBe(102.5);
    expect(after.weeks[2].sessions[0].weekday).toBe(1);
  });
});
