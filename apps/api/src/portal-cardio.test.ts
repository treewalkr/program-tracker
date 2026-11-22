import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { assessments, clientHrProfiles, clients, db, programs, sessionLogs, trainers } from "@pt/db";
import { computeHrZones, localDateOf } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { CLIENT_COOKIE, createClientSession } from "./lib/client-auth";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: trainers.id }).from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping portal cardio tests");
}

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

const RUN = `portal-cardio-${Date.now()}`;

describe.skipIf(!dbUp)("portal cardio", () => {
  let trainerId = "";
  let clientId = "";
  let otherId = "";
  let token = "";
  let otherToken = "";
  const today = localDateOf(Date.now());
  const runId = crypto.randomUUID();
  const otherRunId = crypto.randomUUID();
  const cardioSession = (id: string) => ({
    id,
    name: "Intervals",
    seq: 1,
    order: 0,
    weekday: null,
    kind: "cardio",
    exercises: [],
    cardio: {
      modality: "Running",
      hrZone: 2,
      modalityId: "mod-internal-id",
      templateId: "intervals",
      intervals: [
        { id: "w", type: "warmup", repeat: 1, durationSec: 600, hrZone: 2 },
        { id: "r", type: "work", repeat: 4, durationSec: 180, hrZone: 4, recovery: { type: "active_recovery", durationSec: 120 } },
      ],
    },
  });

  beforeAll(async () => {
    const [tr] = await db.insert(trainers).values({ name: "Coach Oat", email: `${RUN}@coach.dev` }).returning();
    trainerId = tr.id;
    const [c, o] = await db
      .insert(clients)
      .values([
        { trainerId, name: "Nok", portalEnabledAt: new Date(), cardioTarget: { unit: "session_load", value: 600 } },
        { trainerId, name: "Other", portalEnabledAt: new Date() },
      ])
      .returning();
    clientId = c.id;
    otherId = o.id;
    const week = (id: string) => [{ week: 1, sessions: [cardioSession(id)] }];
    await db.insert(programs).values([
      { trainerId, clientId, name: "Nok block", status: "active", activatedAt: new Date(), startsOn: today, sessions: week(runId) as never },
      { trainerId, clientId: otherId, name: "Other block", status: "active", activatedAt: new Date(), startsOn: today, sessions: week(otherRunId) as never },
    ]);
    await db.insert(clientHrProfiles).values({
      clientId,
      version: 1,
      effectiveFrom: "2026-01-01",
      method: "karvonen",
      restingHr: 58,
      maxHr: 188,
      lthr: 171,
      zones: computeHrZones("karvonen", { restingHr: 58, maxHr: 188 })!,
    });
    token = (await createClientSession(clientId)).token;
    otherToken = (await createClientSession(otherId)).token;
  });
  afterAll(async () => {
    await db.delete(trainers).where(inArray(trainers.id, [trainerId]));
  });

  test("the week carries intervals with bpm resolved, and no HR profile internals or library ids", async () => {
    const r = await call("GET", "/v1/portal/week", { token });
    expect(r.status).toBe(200);
    const cardio = r.body.weeks[0].sessions[0].cardio;
    expect(cardio.hrBpm).toEqual({ min: 110, max: 129 });
    expect(cardio.intervals[0]).toMatchObject({ id: "w", type: "warmup", hrBpm: { min: 110, max: 129 } });
    expect(cardio.intervals[1]).toMatchObject({ repeat: 4, hrBpm: { min: 149, max: 168 }, recovery: { type: "active_recovery", durationSec: 120 } });
    // explicit allow-list: the JSON carries bpm targets and nothing else from the profile
    for (const leak of ["restingHr", "maxHr", "lthr", "karvonen", "method", "zones", "hrProfileVersion", "zonesBpm", "modalityId", "mod-internal-id", "templateId"]) {
      expect(r.text).not.toContain(leak);
    }
  });

  test("POST /logs takes the new cardio fields; feedback reaches the client's entry after review", async () => {
    const log = await call("POST", "/v1/portal/logs", {
      token,
      body: {
        programSessionId: runId,
        date: today,
        kind: "cardio",
        cardio: {
          modality: "Running",
          durationSec: 1980,
          rpe: 7,
          distanceKm: 5.2,
          avgHr: 152,
          maxHr: 176,
          calories: 410,
          pain: { reported: false },
          intervals: [{ intervalId: "r", rep: 1, durationSec: 181, avgHr: 168, rpe: 8 }],
        },
        sets: [],
      },
    });
    expect(log.status).toBe(201);
    // the reply stays minimal; the row keeps seconds, mirrored minutes and the plan snapshot
    expect(Object.keys(log.body).sort()).toEqual(["date", "id", "loggedBy", "programSessionId"]);
    const [row] = await db.select().from(sessionLogs).where(eq(sessionLogs.id, log.body.id));
    expect(row.cardio).toMatchObject({ durationSec: 1980, durationMin: 33, avgHr: 152 });
    expect(row.prescription?.zonesBpm).toHaveLength(5);

    // a completed log without RPE is refused, as for the trainer
    const noRpe = await call("POST", "/v1/portal/logs", {
      token,
      body: { programSessionId: runId, date: today, kind: "cardio", cardio: { modality: "Running", durationSec: 1980 }, sets: [], onDuplicate: "replace" },
    });
    expect(noRpe.status).toBe(422);

    await db.update(sessionLogs).set({ trainerFeedback: "Strong last rep.", reviewedAt: new Date() }).where(eq(sessionLogs.id, log.body.id));
    const week = await call("GET", "/v1/portal/week", { token });
    const entry = week.body.weeks[0].sessions[0].log.entry;
    expect(entry.trainerFeedback).toBe("Strong last rep.");
    expect(entry.reviewedAt).toBeTruthy();
    expect(entry.cardio.intervals[0]).toMatchObject({ intervalId: "r", avgHr: 168 });
    // the snapshot stays with the coach
    expect(week.text).not.toContain("zonesBpm");
    expect(week.text).not.toContain("programVersion");
  });

  test("progress: this week's load against the target, recent cardio with feedback, one VO₂max trend", async () => {
    await db.insert(assessments).values([
      { clientId, protocol: "cooper_12min", formulaVersion: "cooper-1968", testedOn: "2026-09-01", inputs: { distanceM: 2300 }, result: 40.1 },
      { clientId, protocol: "cooper_12min", formulaVersion: "cooper-1968", testedOn: "2026-10-01", inputs: { distanceM: 2400 }, result: 42.4 },
      { clientId, protocol: "run_1_5mile", formulaVersion: "acsm-1.5mi", testedOn: "2026-10-15", inputs: { timeSec: 720 }, result: 43.8 },
    ]);
    const r = await call("GET", "/v1/portal/progress", { token });
    expect(r.status).toBe(200);
    expect(r.body.week).toMatchObject({ minutes: 33, sessions: 1, load: 231 });
    expect(r.body.week.byModality.Running).toEqual({ minutes: 33, sessions: 1, load: 231, distanceKm: 5.2 });
    expect(r.body.target).toEqual({ unit: "session_load", target: 600, done: 231 });
    expect(r.body.recent[0]).toMatchObject({ modality: "Running", durationSec: 1980, load: 231, trainerFeedback: "Strong last rep.", skipped: false });
    expect(r.body.vo2).toEqual({ protocols: ["run_1_5mile", "cooper_12min"], protocol: "run_1_5mile", points: [{ testedOn: "2026-10-15", value: 43.8 }] });
    const cooper = await call("GET", "/v1/portal/progress?protocol=cooper_12min", { token });
    expect(cooper.body.vo2.points.map((p: any) => p.value)).toEqual([40.1, 42.4]);
    expect(r.text).not.toContain("inputs");
    expect(r.text).not.toContain("formulaVersion");
    expect((await call("GET", "/v1/portal/progress?protocol=lab", { token })).status).toBe(422);
    expect((await call("GET", "/v1/portal/progress")).status).toBe(401);
  });

  test("a member can't read or log for another member", async () => {
    // the other member sees only their own empty progress and week
    const theirs = await call("GET", "/v1/portal/progress", { token: otherToken });
    expect(theirs.body.recent).toEqual([]);
    expect(theirs.body.vo2.points).toEqual([]);
    expect(theirs.body.target).toBeNull();
    const theirWeek = await call("GET", "/v1/portal/week", { token: otherToken });
    expect(theirWeek.body.weeks[0].sessions[0].id).toBe(otherRunId);
    expect(theirWeek.body.weeks[0].sessions[0].cardio.hrBpm).toBeUndefined(); // no HR profile → no bpm
    // logging against Nok's session as the other member is refused
    const cross = await call("POST", "/v1/portal/logs", {
      token: otherToken,
      body: { programSessionId: runId, date: today, kind: "cardio", cardio: { modality: "Running", durationSec: 1200, rpe: 5 }, sets: [] },
    });
    expect(cross.status).toBe(422);
    const mine = await db.select().from(sessionLogs).where(eq(sessionLogs.clientId, otherId));
    expect(mine).toHaveLength(0);
  });
});
