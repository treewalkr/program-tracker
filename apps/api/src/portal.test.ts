import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { clientSessions, clients, db, exercises, programs, sessionLogs, setLogs, signalOutbox, trainers } from "@pt/db";
import { addDays, localDateOf } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { CLIENT_COOKIE, claimClient, createClientSession, deleteClientSessions } from "./lib/client-auth";
import type { GoogleProfile } from "./lib/auth";
import { app } from "./app";
import { getDefaultTrainerId } from "./lib/trainer";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: trainers.id }).from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping portal tests");
}

/** A request as a portal client (cookie) — never a trainer session. */
const call = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(opts.token ? { cookie: `${CLIENT_COOKIE}=${opts.token}` } : {}),
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }),
  );
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, text, setCookie: res.headers.get("set-cookie") };
};

const RUN = `portal-${Date.now()}`;

describe.skipIf(!dbUp)("portal sign-in by access link", () => {
  let trainerId = "";
  let clientId = "";
  const token = `${RUN}-link`;

  beforeAll(async () => {
    const [tr] = await db.insert(trainers).values({ name: "Coach Ploy", email: `${RUN}@coach.dev` }).returning();
    trainerId = tr.id;
    const [c] = await db
      .insert(clients)
      .values({ trainerId, name: "Nok Saetang", portalEnabledAt: new Date(), portalToken: token })
      .returning();
    clientId = c.id;
  });
  afterAll(async () => {
    await db.delete(trainers).where(inArray(trainers.id, [trainerId]));
  });

  test("GET on the link only names who it's for — no session, no cookie", async () => {
    const r = await call("GET", `/v1/portal/link/${token}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ clientFirstName: "Nok", trainerName: "Coach Ploy" });
    expect(r.setCookie).toBeNull();
    expect(await db.select().from(clientSessions).where(eq(clientSessions.clientId, clientId))).toHaveLength(0);
    expect((await call("GET", "/v1/portal/link/nope")).status).toBe(404);
  });

  test("POST on the link sets the client cookie; /me then knows the client", async () => {
    const r = await call("POST", `/v1/portal/link/${token}`);
    expect(r.status).toBe(200);
    expect(r.setCookie).toContain(`${CLIENT_COOKIE}=`);
    expect(r.setCookie?.toLowerCase()).toContain("httponly");
    const cookieToken = /pt_client=([^;]+)/.exec(r.setCookie ?? "")![1];
    const me = await call("GET", "/v1/portal/me", { token: cookieToken });
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ client: { id: clientId, name: "Nok Saetang" }, trainer: { name: "Coach Ploy" } });
    const [row] = await db.select().from(clients).where(eq(clients.id, clientId));
    expect(row.portalLastSeenAt).not.toBeNull();
  });

  test("no cookie or a bad cookie is 401, even with AUTH_DISABLED", async () => {
    expect(process.env.AUTH_DISABLED).toBe("true");
    expect((await call("GET", "/v1/portal/me")).status).toBe(401);
    expect((await call("GET", "/v1/portal/me", { token: "garbage" })).status).toBe(401);
  });

  test("a trainer session cookie is not a client session", async () => {
    const res = await app.handle(new Request("http://localhost/v1/portal/me", { headers: { cookie: "pt_session=whatever" } }));
    expect(res.status).toBe(401);
  });

  test("logout ends the session", async () => {
    const { token: t } = await createClientSession(clientId);
    expect((await call("GET", "/v1/portal/me", { token: t })).status).toBe(200);
    expect((await call("POST", "/v1/portal/logout", { token: t })).status).toBe(200);
    expect((await call("GET", "/v1/portal/me", { token: t })).status).toBe(401);
  });

  test("signing out everywhere kills every session", async () => {
    const a = (await createClientSession(clientId)).token;
    const b = (await createClientSession(clientId)).token;
    await deleteClientSessions(clientId);
    expect((await call("GET", "/v1/portal/me", { token: a })).status).toBe(401);
    expect((await call("GET", "/v1/portal/me", { token: b })).status).toBe(401);
  });

  test("portal off, archived client, or disabled trainer: link 404, sessions 401", async () => {
    const t = (await createClientSession(clientId)).token;
    const check = async (expected: "open" | "closed") => {
      const me = await call("GET", "/v1/portal/me", { token: t });
      const link = await call("GET", `/v1/portal/link/${token}`);
      if (expected === "open") {
        expect(me.status).toBe(200);
        expect(link.status).toBe(200);
      } else {
        expect(me.status).toBe(401);
        expect(link.status).toBe(404);
        expect((await call("POST", `/v1/portal/link/${token}`)).status).toBe(404);
      }
    };
    await check("open");
    await db.update(clients).set({ portalEnabledAt: null }).where(eq(clients.id, clientId));
    await check("closed");
    await db.update(clients).set({ portalEnabledAt: new Date(), status: "archived" }).where(eq(clients.id, clientId));
    await check("closed");
    await db.update(clients).set({ status: "active" }).where(eq(clients.id, clientId));
    await db.update(trainers).set({ disabledAt: new Date() }).where(eq(trainers.id, trainerId));
    await check("closed");
    await db.update(trainers).set({ disabledAt: null }).where(eq(trainers.id, trainerId));
    await check("open");
  });
});

describe.skipIf(!dbUp)("portal Google sign-in", () => {
  const RUN_G = `${RUN}-g`;
  const ids: string[] = [];
  const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({
    sub: `${RUN_G}-sub`,
    email: `${RUN_G}@client.dev`,
    emailVerified: true,
    name: "Fon",
    picture: null,
    ...over,
  });
  let trainerA = "";
  let trainerB = "";

  beforeAll(async () => {
    const [a] = await db.insert(trainers).values({ name: "Coach A", email: `${RUN_G}-a@coach.dev` }).returning();
    const [b] = await db.insert(trainers).values({ name: "Coach B", email: `${RUN_G}-b@coach.dev` }).returning();
    trainerA = a.id;
    trainerB = b.id;
    ids.push(a.id, b.id);
  });
  afterAll(async () => {
    await db.delete(trainers).where(inArray(trainers.id, ids));
  });

  test("matches by email (case-insensitive) only while the portal is on, then links the Google sub", async () => {
    const [c] = await db
      .insert(clients)
      .values({ trainerId: trainerA, name: "Fon", email: `${RUN_G}@Client.dev` })
      .returning();
    expect(await claimClient(profile())).toEqual({ rejection: "not_allowed" });
    expect(await claimClient(profile({ emailVerified: false }))).toEqual({ rejection: "unverified" });
    await db.update(clients).set({ portalEnabledAt: new Date() }).where(eq(clients.id, c.id));
    expect(await claimClient(profile())).toEqual({ clientId: c.id });
    const [row] = await db.select().from(clients).where(eq(clients.id, c.id));
    expect(row.portalGoogleSub).toBe(`${RUN_G}-sub`);
    // linked: the sub signs in even after the email changes
    await db.update(clients).set({ email: "changed@client.dev" }).where(eq(clients.id, c.id));
    expect(await claimClient(profile({ email: "other@gmail.com" }))).toEqual({ clientId: c.id });
    // a different Google account with the old email doesn't take over the linked client
    expect(await claimClient(profile({ sub: "someone-else" }))).toEqual({ rejection: "not_allowed" });
    await db.delete(clients).where(eq(clients.id, c.id));
  });

  test("two trainers invited the same email: the most recently enabled wins", async () => {
    const email = `${RUN_G}-twice@client.dev`;
    const [older] = await db
      .insert(clients)
      .values({ trainerId: trainerA, name: "Twice", email, portalEnabledAt: new Date(Date.now() - 86400_000) })
      .returning();
    const [newer] = await db
      .insert(clients)
      .values({ trainerId: trainerB, name: "Twice", email, portalEnabledAt: new Date() })
      .returning();
    expect(await claimClient(profile({ sub: `${RUN_G}-twice`, email }))).toEqual({ clientId: newer.id });
    expect(older.id).not.toBe(newer.id);
  });

  test("?as=client keeps the trainer callback and remembers who is signing in", async () => {
    const env = {
      GOOGLE_CLIENT_ID: "cid",
      GOOGLE_CLIENT_SECRET: "secret",
      GOOGLE_REDIRECT_URI: "http://localhost:5173/v1/auth/google/callback",
      ADMIN_EMAIL: "boss@example.com",
    };
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    try {
      const res = await app.handle(new Request("http://localhost/v1/auth/google?as=client"));
      expect(res.status).toBe(302);
      const loc = new URL(res.headers.get("location")!);
      expect(loc.searchParams.get("redirect_uri")).toBe(env.GOOGLE_REDIRECT_URI);
      const oauth = decodeURIComponent(/pt_oauth=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")![1]);
      expect(JSON.parse(oauth)).toMatchObject({ as: "client", returnTo: "/me" });
      // a cancelled client sign-in lands on the portal's sign-in page
      const cb = await app.handle(
        new Request("http://localhost/v1/auth/google/callback?error=access_denied", {
          headers: { cookie: `pt_oauth=${encodeURIComponent(oauth)}` },
        }),
      );
      expect(cb.headers.get("location")).toBe("/me/login?error=cancelled");

      // a client comes back to the portal page it started on, in its language; never to a trainer page
      const oauthFor = async (returnTo: string) => {
        const r = await app.handle(new Request(`http://localhost/v1/auth/google?as=client&returnTo=${encodeURIComponent(returnTo)}`));
        return decodeURIComponent(/pt_oauth=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")![1]);
      };
      const th = await oauthFor("/th/me/log/5");
      expect(JSON.parse(th)).toMatchObject({ returnTo: "/th/me/log/5" });
      expect(JSON.parse(await oauthFor("/clients"))).toMatchObject({ returnTo: "/me" });
      expect(JSON.parse(await oauthFor("//evil.test/me"))).toMatchObject({ returnTo: "/me" });
      expect(JSON.parse(await oauthFor("/thai/me"))).toMatchObject({ returnTo: "/me" });
      const thCb = await app.handle(
        new Request("http://localhost/v1/auth/google/callback?error=access_denied", {
          headers: { cookie: `pt_oauth=${encodeURIComponent(th)}` },
        }),
      );
      expect(thCb.headers.get("location")).toBe("/th/me/login?error=cancelled");
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe.skipIf(!dbUp)("portal week and logs", () => {
  const RUN_W = `${RUN}-w`;
  let trainerId = "";
  let otherTrainerId = "";
  let clientId = "";
  let siblingId = "";
  let strangerId = "";
  let programId = "";
  let token = "";
  let siblingToken = "";
  let squatId = "";
  const s1 = crypto.randomUUID();
  const s2 = crypto.randomUUID();
  const next1 = crypto.randomUUID();
  const cardio1 = crypto.randomUUID();
  const slot1 = crypto.randomUUID();
  const slot2 = crypto.randomUUID();
  const today = localDateOf(Date.now());

  const exerciseSession = (id: string, slot: string, name: string, seq: number, weekday: number | null) => ({
    id,
    name,
    seq,
    order: 0,
    weekday,
    kind: "exercises" as const,
    notes: "Brace hard",
    exercises: [
      {
        id: slot,
        exerciseId: squatId,
        order: 0,
        role: "primary" as const,
        notes: "Pause at the bottom",
        prescribedSets: [
          { setNumber: 1, type: "working" as const, reps: 5, amrap: false, percent1rm: 80, targetRpe: 8, restSeconds: 180, tempo: "3-1-1-0" },
          { setNumber: 2, type: "working" as const, reps: 5, amrap: false, targetWeightKg: 60 },
        ],
      },
    ],
  });

  const logBody = (programSessionId: string, over: Record<string, unknown> = {}) => ({
    programSessionId,
    date: today,
    sets: [{ programExerciseId: slot1, exerciseId: squatId, setNumber: 1, weightKg: 100, reps: 5, rpe: 8 }],
    ...over,
  });

  beforeAll(async () => {
    [{ id: squatId }] = await db.select({ id: exercises.id }).from(exercises).where(isNull(exercises.trainerId)).limit(1);
    const [tr] = await db.insert(trainers).values({ name: "Coach Week", email: `${RUN_W}@coach.dev` }).returning();
    const [other] = await db.insert(trainers).values({ name: "Coach Other", email: `${RUN_W}-o@coach.dev` }).returning();
    trainerId = tr.id;
    otherTrainerId = other.id;
    const [c] = await db
      .insert(clients)
      .values({
        trainerId,
        name: "Mai",
        portalEnabledAt: new Date(),
        goals: "SECRET-GOAL",
        limitations: "SECRET-LIMIT bad knee",
        oneRepMaxes: { [squatId]: { kg: 125, date: "2026-10-01" } },
      })
      .returning();
    clientId = c.id;
    const [sib] = await db.insert(clients).values({ trainerId, name: "Sibling", portalEnabledAt: new Date() }).returning();
    siblingId = sib.id;
    const [stranger] = await db.insert(clients).values({ trainerId: otherTrainerId, name: "Stranger" }).returning();
    strangerId = stranger.id;
    const [p] = await db
      .insert(programs)
      .values({
        trainerId,
        clientId,
        name: "Spring Block",
        status: "active",
        activatedAt: new Date(),
        direction: "SECRET-DIRECTION push the squat",
        phasing: { SECRET: "phasing" } as never,
        sessions: [
          {
            week: 1,
            sessions: [
              exerciseSession(s1, slot1, "Lower A", 1, 1),
              exerciseSession(s2, slot2, "Upper A", 2, null),
              { id: cardio1, name: "Easy run", seq: 1, order: 0, weekday: 3, kind: "cardio", exercises: [], cardio: { modality: "Run", durationMin: 30, hrZone: 2 } },
            ],
          },
          { week: 2, sessions: [exerciseSession(next1, crypto.randomUUID(), "Lower B", 1, 1)] },
        ],
      })
      .returning();
    programId = p.id;
    // an older draft for the same client never shows
    await db.insert(programs).values({ trainerId, clientId, name: "Draft Block", status: "draft", sessions: [] });
    token = (await createClientSession(clientId)).token;
    siblingToken = (await createClientSession(siblingId)).token;
  });
  afterAll(async () => {
    await db.delete(trainers).where(inArray(trainers.id, [trainerId, otherTrainerId]));
  });

  test("/week: the active program's current and next week, kg resolved from %1RM", async () => {
    const r = await call("GET", "/v1/portal/week", { token });
    expect(r.status).toBe(200);
    expect(r.body.program).toEqual({ id: programId, name: "Spring Block", startsOn: null });
    expect(r.body.currentWeek).toBe(1);
    expect(r.body.weeks.map((w: any) => [w.week, w.loggable])).toEqual([
      [1, true],
      [2, false],
    ]);
    const [w1] = r.body.weeks;
    expect(w1.startDate).toBe(today);
    const lower = w1.sessions.find((s: any) => s.id === s1);
    expect(lower).toMatchObject({ name: "Lower A", weekday: 1, notes: "Brace hard", log: null });
    expect(lower.exercises[0]).toMatchObject({ id: slot1, exerciseId: squatId, notes: "Pause at the bottom" });
    expect(lower.exercises[0].exerciseName.length).toBeGreaterThan(0);
    // 80% of 125 → 100 kg; a plain kg target passes through
    expect(lower.exercises[0].prescribedSets.map((s: any) => s.targetWeightKg)).toEqual([100, 60]);
    expect(lower.exercises[0].prescribedSets[0]).toMatchObject({ reps: 5, targetRpe: 8, restSeconds: 180, tempo: "3-1-1-0" });
    expect(w1.sessions.find((s: any) => s.id === cardio1).cardio).toEqual({ modality: "Run", durationMin: 30, hrZone: 2 });
  });

  test("/week never carries direction, phasing, limitations, goals, 1RMs or %1RM", async () => {
    const r = await call("GET", "/v1/portal/week", { token });
    for (const leak of ["SECRET", "direction", "phasing", "limitations", "oneRepMaxes", "goals", "percent1rm", "role", "2026-10-01"]) {
      expect(r.text).not.toContain(leak);
    }
  });

  test("last time: the client's own comparable set from before this week, and still nothing private", async () => {
    const [draft] = await db.select({ id: programs.id }).from(programs).where(and(eq(programs.clientId, clientId), eq(programs.status, "draft")));
    const [old] = await db.insert(sessionLogs).values({ clientId, programId: draft.id, date: addDays(today, -7), kind: "exercises" }).returning();
    await db.insert(setLogs).values([
      { sessionLogId: old.id, exerciseId: squatId, setNumber: 1, weightKg: "90", reps: 5, rpe: "7.5" },
      { sessionLogId: old.id, exerciseId: squatId, setNumber: 2, weightKg: "95", reps: 12 },
    ]);
    const r = await call("GET", "/v1/portal/week", { token });
    const squat = r.body.weeks[0].sessions.find((s: any) => s.id === s1).exercises[0];
    // prescribed 5s: the 12-rep set is different work, so the 90 × 5 is "last time"
    expect(squat.last).toEqual({ date: addDays(today, -7), weightKg: 90, reps: 5, rpe: 7.5 });
    for (const leak of ["SECRET", "direction", "phasing", "limitations", "oneRepMaxes", "goals", "percent1rm", "role", "2026-10-01"]) {
      expect(r.text).not.toContain(leak);
    }
    await db.delete(sessionLogs).where(eq(sessionLogs.id, old.id));
  });

  test("a deload week says so in client words; the phasing scheme itself never crosses", async () => {
    const [before] = await db.select({ phasing: programs.phasing }).from(programs).where(eq(programs.id, programId));
    await db
      .update(programs)
      .set({ phasing: { phase: "SECRET-PHASE", nextPhase: "SECRET-NEXT", plannedWeeks: 4, weeks: [{ week: 1, directive: "deload" }, { week: 2, directive: "+volume" }] } as never })
      .where(eq(programs.id, programId));
    const r = await call("GET", "/v1/portal/week", { token });
    expect(r.body.weeks.map((w: any) => w.weekLabel)).toEqual(["deload", null]);
    for (const leak of ["SECRET", "directive", "plannedWeeks", "+volume", "phasing"]) expect(r.text).not.toContain(leak);
    await db.update(programs).set({ phasing: before.phasing }).where(eq(programs.id, programId));
  });

  test("a client with no active program sees none", async () => {
    const r = await call("GET", "/v1/portal/week", { token: siblingToken });
    expect(r.body).toEqual({ program: null, currentWeek: null, weeks: [] });
  });

  test("logging: next week's session, a future date, or a date before the week → 422", async () => {
    expect((await call("POST", "/v1/portal/logs", { token, body: logBody(next1) })).status).toBe(422);
    expect((await call("POST", "/v1/portal/logs", { token, body: logBody(s1, { date: addDays(today, 2) }) })).status).toBe(422);
    expect((await call("POST", "/v1/portal/logs", { token, body: logBody(s1, { date: addDays(today, -3) }) })).status).toBe(422);
    // the day before the week starts is refused too: it would move the block's anchor
    expect((await call("POST", "/v1/portal/logs", { token, body: logBody(s1, { date: addDays(today, -1) }) })).status).toBe(422);
    expect((await call("POST", "/v1/portal/logs", { token, body: { ...logBody(s1), sets: [] } })).status).toBe(422);
    expect((await call("POST", "/v1/portal/logs", { body: logBody(s1) })).status).toBe(401);
  });

  test("a client log lands as logged_by client, shows done, reaches the trainer, and queues signals", async () => {
    const pain = { programExerciseId: slot1, exerciseId: squatId, kind: "pain", note: "knee twinge" };
    const r = await call("POST", "/v1/portal/logs", { token, body: logBody(s1, { flags: [pain], perceivedEnergy: 7 }) });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ programSessionId: s1, date: today, loggedBy: "client" });

    const week = await call("GET", "/v1/portal/week", { token });
    const done = week.body.weeks[0].sessions.find((s: any) => s.id === s1).log;
    expect(done).toMatchObject({ id: r.body.id, loggedBy: "client", date: today });
    // "Edit log" reopens what the client entered, not the plan
    expect(done.entry).toEqual({
      sets: [{ programExerciseId: slot1, exerciseId: squatId, setNumber: 1, type: "working", weightKg: 100, reps: 5, rpe: 8, asPlanned: false }],
      cardio: null,
      notes: null,
      perceivedEnergy: 7,
      readiness: null,
      flags: [pain],
    });
    // the logged 100 kg becomes the last load: set 1 by its own number, set 2 by the lift's latest
    const squat = week.body.weeks[0].sessions.find((s: any) => s.id === s1).exercises[0];
    expect(squat.bodyweight).toBe(false);
    expect(squat.prescribedSets.map((s: any) => s.lastWeightKg)).toEqual([100, 100]);

    const [row] = await db.select().from(sessionLogs).where(eq(sessionLogs.id, r.body.id));
    expect(row).toMatchObject({ clientId, programId, loggedBy: "client", perceivedEnergy: 7 });
    const queued = await db.select().from(signalOutbox).where(like(signalOutbox.signalId, `pain-flag:${clientId}:%`));
    expect(queued.length).toBeGreaterThan(0);
    // the client's own words reach the coach in the pain signal
    expect((queued[0].payload as { evidence: string }).evidence).toContain("knee twinge");
  });

  test("replacing your own log works; replacing the trainer's is a 409", async () => {
    const again = await call("POST", "/v1/portal/logs", { token, body: logBody(s1) });
    expect(again.status).toBe(409);
    expect(again.body.existing.loggedBy).toBe("client");
    const swapped = await call("POST", "/v1/portal/logs", { token, body: logBody(s1, { onDuplicate: "replace" }) });
    expect(swapped.status).toBe(201);
    expect(await db.select().from(sessionLogs).where(and(eq(sessionLogs.clientId, clientId), eq(sessionLogs.programSessionId, s1)))).toHaveLength(1);

    const [trainerLog] = await db
      .insert(sessionLogs)
      .values({ clientId, programId, programSessionId: s2, date: today, kind: "exercises" })
      .returning();
    const blocked = await call("POST", "/v1/portal/logs", { token, body: logBody(s2, { onDuplicate: "replace" }) });
    expect(blocked.status).toBe(409);
    expect(blocked.body.existing).toMatchObject({ id: trainerLog.id, loggedBy: "trainer" });
    const week = await call("GET", "/v1/portal/week", { token });
    expect(week.body.weeks[0].sessions.find((s: any) => s.id === s2).log).toMatchObject({ loggedBy: "trainer" });
    // a coach's log never carries an entry
    expect(week.body.weeks[0].sessions.find((s: any) => s.id === s2).log.entry).toBeUndefined();
    // and the client can't delete it either
    expect((await call("DELETE", `/v1/portal/logs/${trainerLog.id}`, { token })).status).toBe(404);
  });

  test("another client can't delete my log; I can (Undo)", async () => {
    const week = await call("GET", "/v1/portal/week", { token });
    const mine = week.body.weeks[0].sessions.find((s: any) => s.id === s1).log.id;
    expect((await call("DELETE", `/v1/portal/logs/${mine}`, { token: siblingToken })).status).toBe(404);
    expect((await call("DELETE", `/v1/portal/logs/${mine}`, { token })).status).toBe(204);
    expect(await db.select().from(sessionLogs).where(eq(sessionLogs.id, mine))).toHaveLength(0);
  });

  test("a one-tap save stores the prescription as planned, with no RPE the client never gave, and how long it took", async () => {
    const body = logBody(s1, {
      sets: [
        { programExerciseId: slot1, exerciseId: squatId, setNumber: 1, weightKg: 100, reps: 5, asPlanned: true },
        { programExerciseId: slot1, exerciseId: squatId, setNumber: 2, weightKg: 62.5, reps: 6, rpe: 8 },
      ],
    });
    const r = await call("POST", "/v1/portal/logs", { token, body: { ...body, durationMin: 52 } });
    expect(r.status).toBe(201);
    const [saved] = await db.select().from(sessionLogs).where(eq(sessionLogs.id, r.body.id));
    expect(saved.durationMin).toBe(52);
    const rows = await db.select().from(setLogs).where(eq(setLogs.sessionLogId, r.body.id));
    const bySet = Object.fromEntries(rows.map((s) => [s.setNumber, s]));
    expect(bySet[1]).toMatchObject({ asPlanned: true, rpe: null });
    expect(bySet[2]).toMatchObject({ asPlanned: false, rpe: "8.0" });
    expect((await call("DELETE", `/v1/portal/logs/${r.body.id}`, { token })).status).toBe(204);
  });

  test("a client's low readiness and note reach the coach as needs-review signals", async () => {
    const body = logBody(s1, { readiness: { sleep: 2, soreness: 4 }, notes: "Lower back tight after deadlifts" });
    const r = await call("POST", "/v1/portal/logs", { token, body });
    expect(r.status).toBe(201);
    const low = await db.select().from(signalOutbox).where(like(signalOutbox.signalId, `low-readiness:${clientId}:%`));
    expect((low[0]?.payload as { evidence: string }).evidence).toContain("sleep 2/5, soreness 4/5");
    const note = await db.select().from(signalOutbox).where(like(signalOutbox.signalId, `client-note:${clientId}:%`));
    expect((note[0]?.payload as { evidence: string }).evidence).toContain("Lower back tight after deadlifts");
    expect((await call("DELETE", `/v1/portal/logs/${r.body.id}`, { token })).status).toBe(204);
  });

  test("the coach's weekly cardio target shows with this week's minutes", async () => {
    expect((await call("GET", "/v1/portal/week", { token })).body.cardio).toBeNull();
    await db.update(clients).set({ cardioTarget: { unit: "minutes", value: 120 } }).where(eq(clients.id, clientId));
    const run = await call("POST", "/v1/portal/logs", {
      token,
      body: { programSessionId: cardio1, date: today, kind: "cardio", cardio: { modality: "Run", durationSec: 1800, rpe: 4 }, sets: [] },
    });
    expect(run.status).toBe(201);
    expect((await call("GET", "/v1/portal/week", { token })).body.cardio).toEqual({ unit: "minutes", target: 120, done: 30 });
    expect((await call("DELETE", `/v1/portal/logs/${run.body.id}`, { token })).status).toBe(204);
    await db.update(clients).set({ cardioTarget: null }).where(eq(clients.id, clientId));
  });

  test("the phone's own date counts within a day of the server's; further off is refused", async () => {
    const ahead = addDays(today, 1);
    // a phone already on tomorrow (UTC+7 after midnight) can log tomorrow's date
    const r = await call("POST", "/v1/portal/logs", { token, body: logBody(s1, { date: ahead, today: ahead }) });
    expect(r.status).toBe(201);
    expect((await call("DELETE", `/v1/portal/logs/${r.body.id}`, { token })).status).toBe(204);
    // …but not a date past its own today
    expect((await call("POST", "/v1/portal/logs", { token, body: logBody(s1, { date: ahead, today }) })).status).toBe(422);
    const off = await call("POST", "/v1/portal/logs", { token, body: logBody(s1, { today: addDays(today, 3) }) });
    expect(off.status).toBe(422);
    expect(off.body.error).toBe("check the date on your phone");
    // the week view follows the phone's date too
    const w = await call("GET", `/v1/portal/week?today=${ahead}`, { token });
    expect(w.status).toBe(200);
    expect(w.body.currentWeek).toBe(1);
  });

  test("removing your own log works only while its session is in this week", async () => {
    const [later] = await db
      .insert(sessionLogs)
      .values({ clientId, programId, programSessionId: next1, date: today, kind: "exercises", loggedBy: "client" })
      .returning();
    const r = await call("DELETE", `/v1/portal/logs/${later.id}`, { token });
    expect(r.status).toBe(409);
    expect(await db.select().from(sessionLogs).where(eq(sessionLogs.id, later.id))).toHaveLength(1);
    await db.delete(sessionLogs).where(eq(sessionLogs.id, later.id));
  });

  test("before Week 1 starts nothing is loggable and a log is refused", async () => {
    const starts = addDays(today, 4);
    await db.update(programs).set({ startsOn: starts }).where(eq(programs.id, programId));
    try {
      const r = await call("GET", "/v1/portal/week", { token });
      expect(r.body.program).toMatchObject({ id: programId, startsOn: starts });
      expect(r.body.currentWeek).toBe(1);
      expect(r.body.weeks.map((w: any) => [w.week, w.startDate, w.loggable])).toEqual([
        [1, starts, false],
        [2, addDays(starts, 7), false],
      ]);
      const log = await call("POST", "/v1/portal/logs", { token, body: logBody(s1) });
      expect(log.status).toBe(422);
      expect(log.body.error).toContain(starts);
    } finally {
      await db.update(programs).set({ startsOn: null }).where(eq(programs.id, programId));
    }
  });

  test("a client can't log against another client's session or another trainer's client", async () => {
    // the sibling has no active program; s1 belongs to Mai's program
    expect((await call("POST", "/v1/portal/logs", { token: siblingToken, body: logBody(s1) })).status).toBe(422);
    const strangerToken = (await createClientSession(strangerId)).token;
    // the stranger's portal is off: no session counts
    expect((await call("GET", "/v1/portal/week", { token: strangerToken })).status).toBe(401);
  });
});

describe.skipIf(!dbUp)("trainer portal controls", () => {
  /** As the default trainer (AUTH_DISABLED in tests). */
  const asTrainer = (method: string, path: string, body?: unknown) => call(method, path, { body });
  let clientId = "";
  let foreignTrainer = "";

  beforeAll(async () => {
    expect(await getDefaultTrainerId()).toBeTruthy();
    const c = await asTrainer("POST", "/v1/clients", { name: "Portal Pim", email: `${RUN}-pim@client.dev` });
    clientId = c.body.id;
  });
  afterAll(async () => {
    await db.delete(clients).where(eq(clients.id, clientId));
    if (foreignTrainer) await db.delete(trainers).where(eq(trainers.id, foreignTrainer));
  });

  test("off by default; the client row never carries portal secrets", async () => {
    const r = await asTrainer("GET", `/v1/clients/${clientId}/portal`);
    expect(r.body).toMatchObject({ enabled: false, link: null, googleLinked: false, lastSeenAt: null });
    const detail = await asTrainer("GET", `/v1/clients/${clientId}`);
    for (const key of ["portalToken", "portalEnabledAt", "portalGoogleSub", "portalLastSeenAt"]) expect(detail.body.client).not.toHaveProperty(key);
  });

  test("turn on → link works; reset → old link and sessions die; off → everything dies", async () => {
    const on = await asTrainer("POST", `/v1/clients/${clientId}/portal`);
    expect(on.status).toBe(200);
    expect(on.body.enabled).toBe(true);
    expect(on.body.link).toMatch(/\/me\/link\/[\w-]+$/);
    // turning on again keeps the same link
    expect((await asTrainer("POST", `/v1/clients/${clientId}/portal`)).body.link).toBe(on.body.link);
    const linkToken = on.body.link.split("/me/link/")[1];

    const signIn = await call("POST", `/v1/portal/link/${linkToken}`);
    const session = /pt_client=([^;]+)/.exec(signIn.setCookie ?? "")![1];
    expect((await call("GET", "/v1/portal/me", { token: session })).status).toBe(200);
    expect((await asTrainer("GET", `/v1/clients/${clientId}/portal`)).body.lastSeenAt).not.toBeNull();

    const reset = await asTrainer("POST", `/v1/clients/${clientId}/portal/reset`);
    expect(reset.body.link).not.toBe(on.body.link);
    expect((await call("GET", "/v1/portal/me", { token: session })).status).toBe(401);
    expect((await call("GET", `/v1/portal/link/${linkToken}`)).status).toBe(404);

    const fresh = reset.body.link.split("/me/link/")[1];
    const again = /pt_client=([^;]+)/.exec((await call("POST", `/v1/portal/link/${fresh}`)).setCookie ?? "")![1];
    const off = await asTrainer("DELETE", `/v1/clients/${clientId}/portal`);
    expect(off.body).toMatchObject({ enabled: false, link: null, googleLinked: false });
    expect((await call("GET", "/v1/portal/me", { token: again })).status).toBe(401);
    expect((await call("GET", `/v1/portal/link/${fresh}`)).status).toBe(404);
  });

  test("another trainer's client is a 404", async () => {
    const [tr] = await db.insert(trainers).values({ name: "Foreign", email: `${RUN}-foreign@coach.dev` }).returning();
    foreignTrainer = tr.id;
    const [c] = await db.insert(clients).values({ trainerId: tr.id, name: "Not yours" }).returning();
    expect((await asTrainer("GET", `/v1/clients/${c.id}/portal`)).status).toBe(404);
    expect((await asTrainer("POST", `/v1/clients/${c.id}/portal`)).status).toBe(404);
    expect((await asTrainer("POST", `/v1/clients/${c.id}/portal/reset`)).status).toBe(404);
    expect((await asTrainer("DELETE", `/v1/clients/${c.id}/portal`)).status).toBe(404);
  });

  test("a client's log shows in the trainer's logs with loggedBy client", async () => {
    const sessionId = crypto.randomUUID();
    const slot = crypto.randomUUID();
    const [{ id: exId }] = await db.select({ id: exercises.id }).from(exercises).where(isNull(exercises.trainerId)).limit(1);
    await db.insert(programs).values({
      trainerId: await getDefaultTrainerId(),
      clientId,
      name: "Pim Block",
      status: "active",
      activatedAt: new Date(),
      sessions: [
        {
          week: 1,
          sessions: [
            { id: sessionId, name: "Day 1", seq: 1, order: 0, kind: "exercises", exercises: [{ id: slot, exerciseId: exId, order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }] },
          ],
        },
      ],
    });
    await asTrainer("POST", `/v1/clients/${clientId}/portal`);
    const token = (await createClientSession(clientId)).token;
    const logged = await call("POST", "/v1/portal/logs", {
      token,
      body: { programSessionId: sessionId, date: localDateOf(Date.now()), sets: [{ programExerciseId: slot, exerciseId: exId, setNumber: 1, reps: 5 }] },
    });
    expect(logged.status).toBe(201);
    const logs = await asTrainer("GET", `/v1/logs/sessions?clientId=${clientId}`);
    expect(logs.body.find((l: any) => l.id === logged.body.id)).toMatchObject({ loggedBy: "client" });
    expect(logs.body.every((l: any) => l.loggedBy === "client" || l.loggedBy === "trainer")).toBe(true);
  });
});
