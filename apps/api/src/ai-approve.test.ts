import { afterAll, describe, expect, test } from "bun:test";
import { eq, inArray, isNull, sql } from "drizzle-orm";
import { aiGenerations, clients, db, exercises, programs, trainers } from "@pt/db";
import type { AiProgramDraft } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { getDefaultTrainerId } from "./lib/trainer";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: trainers.id }).from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping approve race tests");
}

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.handle(
    new Request(`http://local${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

const clientIds: string[] = [];
afterAll(async () => {
  if (!dbUp || clientIds.length === 0) return;
  await db.delete(programs).where(inArray(programs.clientId, clientIds));
  await db.delete(aiGenerations).where(inArray(aiGenerations.clientId, clientIds));
  await db.delete(clients).where(inArray(clients.id, clientIds));
});

const newClient = async (trainerId: string) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [c] = await db
    .insert(clients)
    .values({ trainerId, name: "ZZ-TEST Approve Race", email: `zz-approve-${stamp}@test.dev` })
    .returning();
  clientIds.push(c.id);
  return c;
};

/** A one-week block draft whose only exercise is new, so approve creates a custom exercise. */
const blockDraft = (lift: string): AiProgramDraft => ({
  name: "Race Block",
  rationale: "",
  clientSummary: "",
  weeks: [
    {
      week: 1,
      sessions: [
        {
          name: "Day 1",
          kind: "exercises",
          exercises: [{ exerciseName: lift, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
        },
      ],
    },
  ],
});

describe.skipIf(!dbUp)("POST /v1/ai/generations/:id/approve — at most once", () => {
  test("two concurrent approves of one block draft: one program, one 409", async () => {
    const trainerId = await getDefaultTrainerId();
    const client = await newClient(trainerId);
    const lift = `ZZ Race Lift ${Date.now()}`;
    const [gen] = await db
      .insert(aiGenerations)
      .values({ trainerId, clientId: client.id, kind: "block", providerId: "mock", model: "mock-draft-v1", status: "validated", draft: blockDraft(lift) })
      .returning();

    const results = await Promise.all([
      call("POST", `/v1/ai/generations/${gen.id}/approve`, {}),
      call("POST", `/v1/ai/generations/${gen.id}/approve`, {}),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error).toBe("This draft was already approved.");

    const made = await db.select().from(programs).where(eq(programs.clientId, client.id));
    expect(made).toHaveLength(1);
    expect((await db.select().from(exercises).where(eq(exercises.name, lift))).length).toBe(1);
    const [after] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, gen.id));
    expect(after.status).toBe("approved");
    expect(after.approvedProgramId).toBe(made[0].id);
  });

  /** A trainer-written program for this client: `n` weeks of one squat session. */
  const writtenProgram = async (clientId: string, n: number) => {
    const [lib] = await db.select().from(exercises).where(isNull(exercises.trainerId)).limit(1);
    const wk = (week: number) => ({
      week,
      sessions: [
        {
          id: crypto.randomUUID(),
          name: "Lower",
          seq: 1,
          order: 0,
          kind: "exercises",
          exercises: [{ id: crypto.randomUUID(), exerciseId: lib.id, order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
        },
      ],
    });
    const p = await call("POST", "/v1/programs", { name: "ZZ Race Program", clientId, weeks: Array.from({ length: n }, (_, i) => wk(i + 1)) });
    expect(p.status).toBe(201);
    return p.body as { id: string; version: number };
  };

  test("two concurrent approves of one fill: one write, one version bump, one 409", async () => {
    const trainerId = await getDefaultTrainerId();
    const client = await newClient(trainerId);
    const p = await writtenProgram(client.id, 4);
    const g = await call("POST", "/v1/ai/fill", { clientId: client.id, basedOnProgramId: p.id, providerId: "mock" });
    expect(g.status).toBe(201);

    const results = await Promise.all([
      call("POST", `/v1/ai/generations/${g.body.id}/approve`, {}),
      call("POST", `/v1/ai/generations/${g.body.id}/approve`, {}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error).toBe("This draft was already approved.");
    const [after] = await db.select().from(programs).where(eq(programs.id, p.id));
    expect(after.version).toBe(p.version + 1);
  });

  test("two concurrent approves of one week draft: one version bump, one 409", async () => {
    const trainerId = await getDefaultTrainerId();
    const client = await newClient(trainerId);
    const p = await writtenProgram(client.id, 2);
    expect((await call("PATCH", `/v1/programs/${p.id}/status`, { status: "active" })).status).toBe(200);
    const [active] = await db.select().from(programs).where(eq(programs.id, p.id));
    const lift = `ZZ Race Week Lift ${Date.now()}`;
    const [gen] = await db
      .insert(aiGenerations)
      .values({
        trainerId,
        clientId: client.id,
        kind: "week",
        targetWeek: 2,
        basedOnProgramId: p.id,
        providerId: "mock",
        model: "mock-draft-v1",
        status: "validated",
        draft: blockDraft(lift),
      })
      .returning();

    const results = await Promise.all([
      call("POST", `/v1/ai/generations/${gen.id}/approve`, {}),
      call("POST", `/v1/ai/generations/${gen.id}/approve`, {}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const [after] = await db.select().from(programs).where(eq(programs.id, p.id));
    expect(after.version).toBe(active.version + 1);
    expect((await db.select().from(exercises).where(eq(exercises.name, lift))).length).toBe(1);
  });

  test("approving twice in a row: the second is a 409 and writes nothing", async () => {
    const trainerId = await getDefaultTrainerId();
    const client = await newClient(trainerId);
    const [gen] = await db
      .insert(aiGenerations)
      .values({ trainerId, clientId: client.id, kind: "block", providerId: "mock", model: "mock-draft-v1", status: "validated", draft: blockDraft(`ZZ Seq Lift ${Date.now()}`) })
      .returning();
    expect((await call("POST", `/v1/ai/generations/${gen.id}/approve`, {})).status).toBe(201);
    const again = await call("POST", `/v1/ai/generations/${gen.id}/approve`, {});
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("This draft was already approved.");
    expect(await db.select().from(programs).where(eq(programs.clientId, client.id))).toHaveLength(1);
  });

  test("a write that fails mid-approve rolls everything back: the draft stays validated", async () => {
    const trainerId = await getDefaultTrainerId();
    const client = await newClient(trainerId);
    const lift = `ZZ Rollback Lift ${Date.now()}`;
    const draft = { ...blockDraft(lift), name: "ZZ Boom" };
    const [gen] = await db
      .insert(aiGenerations)
      .values({ trainerId, clientId: client.id, kind: "block", providerId: "mock", model: "mock-draft-v1", status: "validated", draft })
      .returning();
    // The program insert fails after the custom exercise was written.
    await db.execute(sql`create or replace function zz_boom() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$`);
    await db.execute(sql`create trigger zz_boom before insert on programs for each row when (new.name = 'ZZ Boom') execute function zz_boom()`);
    try {
      const res = await call("POST", `/v1/ai/generations/${gen.id}/approve`, {});
      expect(res.status).toBe(500);
    } finally {
      await db.execute(sql`drop trigger zz_boom on programs`);
      await db.execute(sql`drop function zz_boom()`);
    }
    const [after] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, gen.id));
    expect(after.status).toBe("validated");
    expect(after.approvedProgramId).toBeNull();
    expect(await db.select().from(exercises).where(eq(exercises.name, lift))).toHaveLength(0);

    // Retrying once the fault is gone approves it.
    expect((await call("POST", `/v1/ai/generations/${gen.id}/approve`, {})).status).toBe(201);
  });
});
