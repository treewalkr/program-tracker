import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, isNull } from "drizzle-orm";
import { clients, db, exercises, programs, sessionLogs, trainers } from "@pt/db";
import { localDateOf } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { CLIENT_COOKIE, createClientSession } from "./lib/client-auth";
import { getDefaultTrainerId } from "./lib/trainer";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: trainers.id }).from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping strength feedback tests");
}

/** A request as the member (client cookie) or, with no token, as the default trainer. */
const call = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(opts.token ? { cookie: `${CLIENT_COOKIE}=${opts.token}` } : {}),
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  );
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
};

describe.skipIf(!dbUp)("trainer feedback on a strength log reaches the member", () => {
  let clientId = "";
  let programId = "";
  let token = "";
  let squatId = "";
  const today = localDateOf(Date.now());
  const sessionId = crypto.randomUUID();
  const slot = crypto.randomUUID();
  const set = () => ({ programExerciseId: slot, exerciseId: squatId, setNumber: 1, weightKg: 100, reps: 5, rpe: 8 });

  beforeAll(async () => {
    [{ id: squatId }] = await db.select({ id: exercises.id }).from(exercises).where(isNull(exercises.trainerId)).limit(1);
    const trainerId = await getDefaultTrainerId();
    const [c] = await db.insert(clients).values({ trainerId, name: "Strength Feedback", portalEnabledAt: new Date() }).returning();
    clientId = c.id;
    const [p] = await db
      .insert(programs)
      .values({
        trainerId,
        clientId,
        name: "Feedback Block",
        status: "active",
        activatedAt: new Date(),
        startsOn: today,
        sessions: [
          {
            week: 1,
            sessions: [
              {
                id: sessionId,
                name: "Lower A",
                seq: 1,
                order: 0,
                weekday: null,
                kind: "exercises",
                exercises: [{ id: slot, exerciseId: squatId, order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
              },
            ],
          },
        ],
      })
      .returning();
    programId = p.id;
    token = (await createClientSession(clientId)).token;
  });
  afterAll(async () => {
    await db.delete(programs).where(eq(programs.id, programId));
    await db.delete(clients).where(inArray(clients.id, [clientId]));
  });

  const memberSees = async () => (await call("GET", "/v1/portal/week", { token })).body.weeks[0].sessions[0].log;

  test("the review route works on a strength log: the member's own entry carries the feedback and the reviewed mark", async () => {
    const saved = await call("POST", "/v1/portal/logs", { token, body: { programSessionId: sessionId, date: today, sets: [set()] } });
    expect(saved.status).toBe(201);
    expect((await memberSees()).entry).toMatchObject({ trainerFeedback: null, reviewedAt: null });

    const review = await call("PATCH", `/v1/logs/sessions/${saved.body.id}/review`, { body: { reviewed: true, feedback: "  Bar speed looked great.  " } });
    expect(review.status).toBe(200);
    expect(review.body).toMatchObject({ id: saved.body.id, trainerFeedback: "Bar speed looked great." });
    expect(review.body.reviewedAt).toBeTruthy();

    const log = await memberSees();
    expect(log).toMatchObject({ id: saved.body.id, loggedBy: "client" });
    expect(log.entry.trainerFeedback).toBe("Bar speed looked great.");
    expect(log.entry.reviewedAt).toBeTruthy();

    // feedback alone (not reviewed) still shows; clearing it empties it
    const only = await call("PATCH", `/v1/logs/sessions/${saved.body.id}/review`, { body: { reviewed: false, feedback: "Add 2.5 kg next week." } });
    expect(only.status).toBe(200);
    expect((await memberSees()).entry).toMatchObject({ trainerFeedback: "Add 2.5 kg next week.", reviewedAt: null });
    await call("PATCH", `/v1/logs/sessions/${saved.body.id}/review`, { body: { reviewed: false, feedback: "" } });
    expect((await memberSees()).entry.trainerFeedback).toBeNull();
  });

  test("a coach-entered strength log reads back with the feedback too", async () => {
    await call("DELETE", `/v1/portal/logs/${(await memberSees()).id}`, { token });
    const logged = await call("POST", "/v1/logs/sessions", {
      body: { clientId, programId, programSessionId: sessionId, date: today, kind: "exercises", sets: [set()] },
    });
    expect(logged.status).toBe(201);
    expect((await call("PATCH", `/v1/logs/sessions/${logged.body.id}/review`, { body: { reviewed: true, feedback: "Solid." } })).status).toBe(200);
    const log = await memberSees();
    expect(log).toMatchObject({ id: logged.body.id, loggedBy: "trainer" });
    expect(log.entry).toMatchObject({ trainerFeedback: "Solid." });
    expect(log.entry.reviewedAt).toBeTruthy();
    const [row] = await db.select().from(sessionLogs).where(eq(sessionLogs.id, logged.body.id));
    expect(row.kind).toBe("exercises");
  });
});
