import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { clients, db, exercises, programs, sessionTypes, trainers } from "@pt/db";
import { historyExerciseKey, isoWeekday, addDays, defaultWeekStarts } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { CLIENT_COOKIE, createClientSession } from "./lib/client-auth";
import { getDefaultTrainerId } from "./lib/trainer";
import { app } from "./app";

/**
 * Rollback simulation for the session kind rename (docs/kind-rename-plan.md,
 * release 1): data written the release-2 way — kind "exercises" in program
 * JSON, logs, session types, AI drafts and imports — must read through this
 * release with no 4xx/5xx and come back as "lifting"; a release-2 client
 * writing "exercises" must be accepted and stored as "lifting".
 */

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping kind alias tests");
}

const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const res = await app.handle(
    new Request(`http://local${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { cookie: `${CLIENT_COOKIE}=${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, text };
};

/** A kind or format still carrying the alias in a response. */
const ALIAS = /"(kind|format)":\s*"exercises"/;

/** 2xx, no alias anywhere in the body. Returns the body. */
function ok(r: { status: number; body: any; text: string }, label: string) {
  if (r.status >= 400) throw new Error(`${label}: ${r.status} ${r.text.slice(0, 400)}`);
  expect(r.text).not.toMatch(ALIAS);
  return r.body;
}

/** Rewrite a jsonb column's session kinds to the release-2 value, as the release-2 backfill would. */
const toExercises = (column: string) => sql.raw(`replace(${column}::text, '"kind": "lifting"', '"kind": "exercises"')::jsonb`);

const today = new Date().toISOString().slice(0, 10);
const FIXTURE = readFileSync(new URL("../../../packages/shared/fixtures/import/week11-12.txt", import.meta.url), "utf8");

describe.skipIf(!dbUp)("release 1 reads release-2 data (kind alias)", () => {
  let trainerId = "";
  let clientId = "";
  let squatId = "";
  let benchId = "";
  let typeId = "";
  let programId = "";
  let generationId = "";
  let importId = "";
  let proposalMessageId = "";
  let portalToken = "";
  const ids = { s1: [] as string[], s2: [] as string[], c1: [] as string[], ex1: [] as string[], ex2: [] as string[] };

  const week = (w: number) => {
    const s1 = crypto.randomUUID();
    const s2 = crypto.randomUUID();
    const c1 = crypto.randomUUID();
    const ex1 = crypto.randomUUID();
    const ex2 = crypto.randomUUID();
    ids.s1.push(s1);
    ids.s2.push(s2);
    ids.c1.push(c1);
    ids.ex1.push(ex1);
    ids.ex2.push(ex2);
    const set = (n: number) => ({ setNumber: n, type: "working", reps: 5, amrap: false, targetWeightKg: 100 });
    return {
      week: w,
      sessions: [
        { id: s1, name: "Lower", seq: 1, order: 0, weekday: 1, kind: "lifting", typeId, typeName: "ZZ Alias Type", exercises: [{ id: ex1, exerciseId: squatId, order: 0, prescribedSets: [set(1), set(2)] }] },
        { id: s2, name: "Upper", seq: 2, order: 0, weekday: 3, kind: "lifting", exercises: [{ id: ex2, exerciseId: benchId, order: 0, prescribedSets: [set(1), set(2)] }] },
        { id: c1, name: "Easy run", seq: 1, order: 0, weekday: 5, kind: "cardio", exercises: [], cardio: { modality: "Run", durationMin: 30, hrZone: 2 } },
      ],
    };
  };

  beforeAll(async () => {
    trainerId = await getDefaultTrainerId();
    [{ id: squatId }] = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.name, "Back Squat"));
    [{ id: benchId }] = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.name, "Bench Press"));

    const c = await call("POST", "/v1/clients", {
      name: "ZZ Alias Client",
      email: `alias-${crypto.randomUUID()}@test.dev`,
      sessionsPerWeek: 2,
      trainingDays: [1, 3, 5],
    });
    expect(c.status).toBe(201);
    clientId = c.body.id;

    const type = await call("POST", "/v1/session-types", { name: "ZZ Alias Type", format: "lifting" });
    expect(type.status).toBe(201);
    typeId = type.body.id;

    const p = await call("POST", "/v1/programs", { name: "Alias Block", clientId, weeks: [1, 2, 3, 4].map(week) });
    expect(p.status).toBe(201);
    programId = p.body.id;
    expect((await call("PATCH", `/v1/programs/${programId}/status`, { status: "active" })).status).toBe(200);

    // Release-1 writes: a lifting log and a cardio log.
    const lift = await call("POST", "/v1/logs/sessions", {
      clientId, programId, programSessionId: ids.s1[0], date: today, perceivedEnergy: 7,
      sets: [
        { programExerciseId: ids.ex1[0], exerciseId: squatId, setNumber: 1, type: "working", weightKg: 100, reps: 5, rpe: 8 },
        { programExerciseId: ids.ex1[0], exerciseId: squatId, setNumber: 2, type: "working", weightKg: 100, reps: 5, rpe: 8 },
      ],
    });
    expect(lift.status).toBe(201);
    const run = await call("POST", "/v1/logs/sessions", {
      clientId, programId, programSessionId: ids.c1[0], date: today, kind: "cardio", sets: [],
      cardio: { modality: "Run", durationMin: 32, hrZone: 2 },
    });
    expect(run.status).toBe(201);

    const g = await call("POST", "/v1/ai/generate", { clientId, basedOnProgramId: programId, providerId: "mock" });
    expect(g.status).toBe(201);
    generationId = g.body.id;
    const turn = await call("POST", "/v1/ai/chat/turn", { clientId, generationId, message: "More rest on day 1", providerId: "mock" });
    expect(turn.status).toBe(201);
    proposalMessageId = turn.body.messages[1].id;

    const imp = await call("POST", "/v1/ai/imports", { clientId, text: FIXTURE, providerId: "mock" });
    expect(imp.status).toBe(201);
    importId = imp.body.id;

    await db.update(clients).set({ portalEnabledAt: new Date() }).where(eq(clients.id, clientId));
    portalToken = (await createClientSession(clientId)).token;

    // Release 2 backfills: every stored kind and format becomes "exercises".
    await db.execute(sql`update programs set sessions = ${toExercises("sessions")} where client_id = ${clientId}`);
    await db.execute(sql`update session_logs set kind = 'exercises' where client_id = ${clientId} and kind = 'lifting'`);
    await db.execute(sql`update session_types set format = 'exercises' where trainer_id = ${trainerId} and format = 'lifting'`);
    await db.execute(sql`update ai_generations set draft = ${toExercises("draft")} where client_id = ${clientId}`);
    await db.execute(sql`update ai_imports set result = ${toExercises("result")} where client_id = ${clientId}`);
    await db.execute(sql`update chat_messages set proposal = ${toExercises("proposal")} where client_id = ${clientId} and proposal is not null`);
    await db.execute(sql`update llm_calls set parsed = ${toExercises("parsed")} where client_id = ${clientId} and parsed is not null`);
  });

  afterAll(async () => {
    if (!clientId) return;
    await db.delete(clients).where(eq(clients.id, clientId));
    await db.delete(sessionTypes).where(eq(sessionTypes.id, typeId));
  });

  test("the fixture really holds release-2 values", async () => {
    const count = async (q: ReturnType<typeof sql>) => Number(((await db.execute(q)) as unknown as { n: number }[])[0].n);
    expect(await count(sql`select count(*) as n from programs where client_id = ${clientId} and sessions::text like '%"kind": "exercises"%'`)).toBe(1);
    expect(await count(sql`select count(*) as n from programs where client_id = ${clientId} and sessions::text like '%"kind": "lifting"%'`)).toBe(0);
    expect(await count(sql`select count(*) as n from session_logs where client_id = ${clientId} and kind = 'exercises'`)).toBe(1);
    expect(await count(sql`select count(*) as n from session_types where id = ${typeId} and format = 'exercises'`)).toBe(1);
    expect(await count(sql`select count(*) as n from ai_generations where client_id = ${clientId} and draft::text like '%"kind": "exercises"%'`)).toBeGreaterThan(0);
    expect(await count(sql`select count(*) as n from ai_imports where id = ${importId} and result::text like '%"kind": "exercises"%'`)).toBe(1);
  });

  test("drizzle reads of the columns come back canonical", async () => {
    const [p] = await db.select().from(programs).where(eq(programs.id, programId));
    expect(p.sessions[0].sessions.map((s) => s.kind)).toEqual(["lifting", "lifting", "cardio"]);
    const [t] = await db.select({ format: sessionTypes.format }).from(sessionTypes).where(eq(sessionTypes.id, typeId));
    expect(t.format).toBe("lifting");
  });

  test("programs: list, get, edit and save", async () => {
    const list = ok(await call("GET", `/v1/programs?clientId=${clientId}`), "programs list");
    expect(list.length).toBeGreaterThan(0);
    const got = ok(await call("GET", `/v1/programs/${programId}`), "program get");
    expect(got.weeks[0].sessions.map((s: any) => s.kind)).toEqual(["lifting", "lifting", "cardio"]);
    // The editor saves what it read back.
    const saved = ok(await call("PUT", `/v1/programs/${programId}`, { weeks: got.weeks }), "program save");
    expect(saved.weeks[0].sessions[0].kind).toBe("lifting");
    ok(await call("PATCH", `/v1/programs/${programId}/direction`, { direction: "steady" }), "program direction");
  });

  test("logs, history, overview and stats", async () => {
    const logs = ok(await call("GET", `/v1/logs/sessions?clientId=${clientId}`), "logs");
    expect(logs.map((l: any) => l.kind).sort()).toEqual(["cardio", "lifting"]);
    ok(await call("GET", `/v1/logs/sessions?clientId=${clientId}&programId=${programId}`), "logs by program");
    const history = ok(await call("GET", `/v1/logs/history?clientId=${clientId}`), "history");
    expect(JSON.stringify(history)).toContain("100kg");
    ok(await call("GET", `/v1/clients/${clientId}`), "client");
    ok(await call("GET", "/v1/clients/roster"), "roster");
    ok(await call("GET", `/v1/chains/week?clientId=${clientId}`), "chains week");
    ok(await call("GET", "/v1/notifications"), "notifications");
    ok(await call("GET", `/v1/admin/clients/${clientId}`), "admin client");
    const msg = ok(await call("POST", "/v1/client-messages/generate", { clientId, programId, week: 1, providerId: "mock" }), "weekly message");
    expect(msg.stats.sessionsLogged).toBe(2);
    expect(msg.stats.sets).toBe(2);
  });

  test("client portal: week and a client log", async () => {
    const wk = ok(await call("GET", "/v1/portal/week", undefined, portalToken), "portal week");
    const sessions = wk.weeks[0].sessions;
    expect(sessions.map((s: any) => s.kind).sort()).toEqual(["cardio", "lifting", "lifting"]);
    // The trainer's release-2 lifting log shows as done.
    expect(sessions.find((s: any) => s.id === ids.s1[0]).log).not.toBeNull();
    const log = await call(
      "POST",
      "/v1/portal/logs",
      { programSessionId: ids.s2[0], date: today, sets: [{ programExerciseId: ids.ex2[0], exerciseId: benchId, setNumber: 1, weightKg: 80, reps: 5 }] },
      portalToken
    );
    const saved = ok(log, "portal log");
    const [row] = (await db.execute(sql`select kind from session_logs where id = ${saved.id}`)) as unknown as { kind: string }[];
    expect(row.kind).toBe("lifting");
  });

  test("AI: context, generation read, edit, chat, proposal build and approve", async () => {
    const gen = ok(await call("GET", `/v1/ai/generations/${generationId}`), "generation get");
    expect(gen.draft.weeks[0].sessions.some((s: any) => s.kind === "lifting")).toBe(true);
    ok(await call("GET", "/v1/ai/generations/pending"), "pending");
    ok(await call("GET", `/v1/ai/chat?clientId=${clientId}`), "chat list");
    ok(await call("POST", "/v1/ai/chat", { clientId, message: "Why this split?", providerId: "mock" }), "chat q&a");
    const built = ok(await call("POST", `/v1/ai/chat/proposals/${proposalMessageId}/build`, { providerId: "mock" }), "proposal build");
    const builtId = built.generation?.id ?? built.id;
    const edited = ok(await call("POST", `/v1/ai/generations/${builtId}/edit`, { ops: [{ op: "move", refs: [{ day: 1, slot: 1 }], dir: "down" }] }), "draft edit");
    const editedId = edited.generation?.id ?? edited.id;
    ok(await call("POST", `/v1/ai/generations/${editedId}/revise`, { message: "Lighter week 1", providerId: "mock" }), "revise");
    // Context reads the release-2 program and logs.
    const next = ok(await call("POST", "/v1/ai/generate", { clientId, basedOnProgramId: programId, providerId: "mock" }), "generate");
    expect(next.status).toBe("validated");
    // Approve the release-2 stored draft.
    const approved = ok(await call("POST", `/v1/ai/generations/${generationId}/approve`, {}), "approve");
    expect(approved.weeks[0].sessions.some((s: any) => s.kind === "lifting")).toBe(true);
    const [row] = (await db.execute(sql`select sessions::text as t from programs where id = ${approved.id}`)) as unknown as { t: string }[];
    expect(row.t).not.toContain('"kind": "exercises"');
  });

  test("AI: fill on a release-2 program and apply it", async () => {
    const fill = ok(await call("POST", "/v1/ai/fill", { clientId, basedOnProgramId: programId, providerId: "mock" }), "fill");
    expect(fill.kind).toBe("fill");
    expect(fill.draft.weeks.filter((w: any) => w.locked).map((w: any) => w.week)).toEqual([1]);
    // the fill draft is stored; make it release-2 shaped too before applying
    await db.execute(sql`update ai_generations set draft = ${toExercises("draft")} where id = ${fill.id}`);
    const applied = ok(await call("POST", `/v1/ai/generations/${fill.id}/approve`, {}), "fill apply");
    expect(applied.id).toBe(programId);
    expect(applied.weeks[3].sessions.filter((s: any) => s.kind === "lifting")).toHaveLength(2);
  });

  test("imports: read, list and save history", async () => {
    const got = ok(await call("GET", `/v1/ai/imports/${importId}`), "import get");
    const kinds = got.result.weeks.flatMap((w: any) => w.days.flatMap((d: any) => d.sessions.map((s: any) => s.kind)));
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((k: string) => k === "lifting" || k === "cardio")).toBe(true);
    ok(await call("GET", `/v1/ai/imports?clientId=${clientId}`), "import list");

    const [squat] = await db.select().from(exercises).where(eq(exercises.name, "Back Squat"));
    const picks: Record<string, string> = {};
    for (const w of got.result.weeks) for (const d of w.days) for (const s of d.sessions) for (const e of s.exercises) picks[historyExerciseKey(e.sourceName)] = squat.id;
    const latestMonday = addDays(today, -(isoWeekday(today) - 1) - 7);
    const saved = ok(await call("POST", `/v1/ai/imports/${importId}/history`, { weekStarts: defaultWeekStarts(2, latestMonday), exercises: picks }), "history save");
    expect(saved.sessions).toBeGreaterThan(0);
    const rows = (await db.execute(sql`select sessions::text as t from programs where client_id = ${clientId} and status = 'archived'`)) as unknown as { t: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.t.includes('"kind": "lifting"') && !r.t.includes('"kind": "exercises"'))).toBe(true);
  });

  test("session types: list, rename and usage", async () => {
    const list = ok(await call("GET", "/v1/session-types"), "types");
    const mine = list.find((t: any) => t.id === typeId);
    expect(mine).toMatchObject({ format: "lifting" });
    expect(mine.usedIn).toBeGreaterThan(0);
    expect(list.find((t: any) => t.presetKey === "strength-training").format).toBe("lifting");
    expect(ok(await call("PATCH", `/v1/session-types/${typeId}`, { name: "ZZ Alias Type 2" }), "type rename").format).toBe("lifting");
  });

  describe("a release-2 client writes exercises", () => {
    test("program create and save store lifting", async () => {
      const w = week(1);
      const body = { name: "R2 Block", clientId, weeks: [{ ...w, sessions: w.sessions.map((s) => (s.kind === "lifting" ? { ...s, kind: "exercises" } : s)) }] };
      const created = ok(await call("POST", "/v1/programs", body), "R2 program create");
      expect(created.weeks[0].sessions.map((s: any) => s.kind)).toEqual(["lifting", "lifting", "cardio"]);
      const put = ok(await call("PUT", `/v1/programs/${created.id}`, { weeks: body.weeks }), "R2 program save");
      expect(put.weeks[0].sessions[0].kind).toBe("lifting");
      const [row] = (await db.execute(sql`select sessions::text as t from programs where id = ${created.id}`)) as unknown as { t: string }[];
      expect(row.t).not.toContain('"kind": "exercises"');
      expect(row.t).toContain('"kind": "lifting"');
    });

    test("trainer and portal logs store lifting", async () => {
      const log = ok(
        await call("POST", "/v1/logs/sessions", {
          clientId, programId, programSessionId: null, date: today, kind: "exercises",
          sets: [{ exerciseId: squatId, setNumber: 1, type: "working", weightKg: 60, reps: 8 }],
        }),
        "R2 trainer log"
      );
      expect(log.kind).toBe("lifting");
      const portal = ok(
        await call(
          "POST",
          "/v1/portal/logs",
          { programSessionId: ids.s2[0], date: today, kind: "exercises", onDuplicate: "replace", sets: [{ programExerciseId: ids.ex2[0], exerciseId: benchId, setNumber: 1, weightKg: 82.5, reps: 5 }] },
          portalToken
        ),
        "R2 portal log"
      );
      const rows = (await db.execute(sql`select kind from session_logs where id in (${log.id}, ${portal.id})`)) as unknown as { kind: string }[];
      expect(rows.map((r) => r.kind)).toEqual(["lifting", "lifting"]);
      // a bad kind is still a 422
      const bad = await call("POST", "/v1/logs/sessions", { clientId, programId, programSessionId: null, date: today, kind: "strength", sets: [] });
      expect(bad.status).toBe(422);
    });

    test("session type create and format change store lifting", async () => {
      const created = ok(await call("POST", "/v1/session-types", { name: `ZZ R2 ${crypto.randomUUID().slice(0, 6)}`, format: "exercises" }), "R2 type create");
      expect(created.format).toBe("lifting");
      const toCardio = ok(await call("PATCH", `/v1/session-types/${created.id}`, { format: "cardio" }), "R2 type cardio");
      expect(toCardio.format).toBe("cardio");
      const back = ok(await call("PATCH", `/v1/session-types/${created.id}`, { format: "exercises" }), "R2 type back");
      expect(back.format).toBe("lifting");
      const [row] = (await db.execute(sql`select format from session_types where id = ${created.id}`)) as unknown as { format: string }[];
      expect(row.format).toBe("lifting");
      expect((await call("POST", "/v1/session-types", { name: "ZZ R2 bad", format: "strength" })).status).toBe(422);
      expect((await call("POST", "/v1/session-types", { name: "ZZ R2 any", format: "any" })).status).toBe(422);
      await call("DELETE", `/v1/session-types/${created.id}`);
    });
  });
});
