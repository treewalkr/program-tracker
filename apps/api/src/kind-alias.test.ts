import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { clients, db, exercises, programs, sessionLogs, sessionTypes, trainers } from "@pt/db";
import { historyExerciseKey, isoWeekday, addDays, defaultWeekStarts } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { CLIENT_COOKIE, createClientSession } from "./lib/client-auth";
import { getDefaultTrainerId } from "./lib/trainer";
import { app } from "./app";

/**
 * Old data through the session kind alias (docs/kind-rename-plan.md, release 2).
 * Every store holds release-1 rows, inserted by raw SQL: kind "lifting" in the
 * program JSON, logs and session types (as before the 0067 backfill, or written
 * by v0.1.35 after a rollback), and in the history stores the backfill leaves
 * alone (AI drafts, chat proposals, import results, LLM calls). Every route
 * must read them with no 4xx/5xx and answer "exercises"; a client that still
 * writes "lifting" must be stored as "exercises".
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

/** A kind or format still carrying the old value in a response. */
const OLD = /"(kind|format)":\s*"lifting"/;

/** Every route the test reads or writes through, for the coverage check at the end. */
const routes = new Set<string>();

/** 2xx, no old value anywhere in the body. Returns the body. */
function ok(r: { status: number; body: any; text: string }, label: string) {
  routes.add(label);
  if (r.status >= 400) throw new Error(`${label}: ${r.status} ${r.text.slice(0, 400)}`);
  expect(r.text).not.toMatch(OLD);
  return r.body;
}

/** A history jsonb column as release 1 wrote it: session kinds / type formats "exercises" → "lifting" (test setup only). */
const toRelease1 = (column: string) =>
  sql.raw(`replace(replace(${column}::text, '"kind": "exercises"', '"kind": "lifting"'), '"format": "exercises"', '"format": "lifting"')::jsonb`);

const count = async (q: ReturnType<typeof sql>) => Number(((await db.execute(q)) as unknown as { n: number }[])[0].n);
const rawText = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { t: string }[]).map((r) => r.t);

const today = new Date().toISOString().slice(0, 10);
const FIXTURE = readFileSync(new URL("../../../packages/shared/fixtures/import/week11-12.txt", import.meta.url), "utf8");

describe.skipIf(!dbUp)("release 2 reads release-1 data (kind alias)", () => {
  let trainerId = "";
  let clientId = "";
  let squatId = "";
  let benchId = "";
  let typeId = "";
  let programId = "";
  let liftLogId = "";
  let spareLogId = "";
  let generationId = "";
  let importId = "";
  let proposalMessageId = "";
  let portalToken = "";
  const ids = { s1: [] as string[], s2: [] as string[], c1: [] as string[], ex1: [] as string[], ex2: [] as string[] };

  const set = (n: number) => ({ setNumber: n, type: "working", reps: 5, amrap: false, targetWeightKg: 100 });
  /** One release-1 week: two "lifting" sessions (one typed) and a cardio session. */
  const week = (w: number) => {
    const [s1, s2, c1, ex1, ex2] = Array.from({ length: 5 }, () => crypto.randomUUID());
    ids.s1.push(s1);
    ids.s2.push(s2);
    ids.c1.push(c1);
    ids.ex1.push(ex1);
    ids.ex2.push(ex2);
    return {
      week: w,
      sessions: [
        { id: s1, name: "Lower", seq: 1, order: 0, weekday: 1, kind: "lifting", typeId, typeName: "ZZ Alias Type", exercises: [{ id: ex1, exerciseId: squatId, order: 0, prescribedSets: [set(1), set(2)] }] },
        { id: s2, name: "Upper", seq: 2, order: 0, weekday: 3, kind: "lifting", exercises: [{ id: ex2, exerciseId: benchId, order: 0, prescribedSets: [set(1), set(2)] }] },
        { id: c1, name: "Easy run", seq: 1, order: 0, weekday: 5, kind: "cardio", exercises: [], cardio: { modality: "Run", durationMin: 30, hrZone: 2 } },
      ],
    };
  };

  /** A raw release-1 log row (kind "lifting" or "cardio"), with sets for a lifting log. */
  async function insertLog(kind: "lifting" | "cardio", sessionId: string | null, date: string, sets: { exId: string; peId: string | null }[] = []) {
    const cardio = kind === "cardio" ? JSON.stringify({ modality: "Run", durationMin: 32, hrZone: 2 }) : null;
    const [{ id }] = (await db.execute(sql`
      insert into session_logs (client_id, program_id, program_session_id, date, kind, cardio, perceived_energy)
      values (${clientId}, ${programId}, ${sessionId}, ${date}, ${kind}, ${cardio}::jsonb, 7) returning id`)) as unknown as { id: string }[];
    for (const [i, s] of sets.entries()) {
      await db.execute(sql`
        insert into set_logs (session_log_id, program_exercise_id, exercise_id, set_number, type, weight_kg, reps, rpe)
        values (${id}, ${s.peId}, ${s.exId}, ${i + 1}, 'working', 100, 5, 8)`);
    }
    return id;
  }

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

    // Release-1 rows, raw SQL: a custom type, an active program, logs.
    [{ id: typeId }] = (await db.execute(sql`
      insert into session_types (trainer_id, name, format) values (${trainerId}, 'ZZ Alias Type', 'lifting') returning id`)) as unknown as { id: string }[];
    const weeks = [1, 2, 3, 4].map((w) => week(w));
    [{ id: programId }] = (await db.execute(sql`
      insert into programs (trainer_id, client_id, name, status, activated_at, sessions)
      values (${trainerId}, ${clientId}, 'Alias Block', 'active', now(), ${JSON.stringify(weeks)}::jsonb) returning id`)) as unknown as { id: string }[];
    liftLogId = await insertLog("lifting", ids.s1[0], today, [{ exId: squatId, peId: ids.ex1[0] }, { exId: squatId, peId: ids.ex1[0] }]);
    await insertLog("cardio", ids.c1[0], today);
    spareLogId = await insertLog("lifting", null, addDays(today, -1), [{ exId: benchId, peId: null }]);

    // AI history written through the routes (mock provider), then stored release-1 style.
    const g = await call("POST", "/v1/ai/generate", { clientId, basedOnProgramId: programId, providerId: "mock" });
    expect(g.status).toBe(201);
    generationId = g.body.id;
    const turn = await call("POST", "/v1/ai/chat/turn", { clientId, generationId, message: "More rest on day 1", providerId: "mock" });
    expect(turn.status).toBe(201);
    proposalMessageId = turn.body.messages[1].id;
    const imp = await call("POST", "/v1/ai/imports", { clientId, text: FIXTURE, providerId: "mock" });
    expect(imp.status).toBe(201);
    importId = imp.body.id;
    await db.execute(sql`update ai_generations set draft = ${toRelease1("draft")} where client_id = ${clientId}`);
    await db.execute(sql`update ai_imports set result = ${toRelease1("result")} where client_id = ${clientId}`);
    await db.execute(sql`update chat_messages set proposal = ${toRelease1("proposal")} where client_id = ${clientId} and proposal is not null`);
    await db.execute(sql`update llm_calls set parsed = ${toRelease1("parsed")} where client_id = ${clientId} and parsed is not null`);

    await db.update(clients).set({ portalEnabledAt: new Date() }).where(eq(clients.id, clientId));
    portalToken = (await createClientSession(clientId)).token;
  });

  afterAll(async () => {
    if (!clientId) return;
    await db.delete(clients).where(eq(clients.id, clientId));
    await db.execute(sql`delete from session_types where trainer_id = ${trainerId} and name like 'ZZ %'`);
  });

  test("the fixture really holds release-1 values in every store", async () => {
    expect(await count(sql`select count(*) as n from programs where id = ${programId} and sessions::text like '%"kind": "lifting"%'`)).toBe(1);
    expect(await count(sql`select count(*) as n from programs where id = ${programId} and sessions::text like '%"kind": "exercises"%'`)).toBe(0);
    expect(await count(sql`select count(*) as n from session_logs where client_id = ${clientId} and kind = 'lifting'`)).toBe(2);
    expect(await count(sql`select count(*) as n from session_types where id = ${typeId} and format = 'lifting'`)).toBe(1);
    expect(await count(sql`select count(*) as n from ai_generations where client_id = ${clientId} and draft::text like '%"kind": "lifting"%'`)).toBeGreaterThan(0);
    expect(await count(sql`select count(*) as n from ai_imports where id = ${importId} and result::text like '%"kind": "lifting"%'`)).toBe(1);
    expect(await count(sql`select count(*) as n from chat_messages where id = ${proposalMessageId} and proposal is not null`)).toBe(1);
  });

  test("drizzle reads of the columns come back canonical", async () => {
    const [p] = await db.select().from(programs).where(eq(programs.id, programId));
    expect(p.sessions[0].sessions.map((s) => s.kind)).toEqual(["exercises", "exercises", "cardio"]);
    const [t] = await db.select({ format: sessionTypes.format }).from(sessionTypes).where(eq(sessionTypes.id, typeId));
    expect(t.format).toBe("exercises");
    const [l] = await db.select({ kind: sessionLogs.kind }).from(sessionLogs).where(eq(sessionLogs.id, liftLogId));
    expect(l.kind).toBe("exercises");
  });

  test("programs: list, get, direction, examples", async () => {
    const list = ok(await call("GET", `/v1/programs?clientId=${clientId}`), "GET /v1/programs");
    expect(list.length).toBeGreaterThan(0);
    const got = ok(await call("GET", `/v1/programs/${programId}`), "GET /v1/programs/:id");
    expect(got.weeks[0].sessions.map((s: any) => s.kind)).toEqual(["exercises", "exercises", "cardio"]);
    ok(await call("PATCH", `/v1/programs/${programId}/direction`, { direction: "steady" }), "PATCH /v1/programs/:id/direction");
    // An example taken from the old program counts its exercise sessions.
    const ex = ok(await call("POST", "/v1/examples", { programId, goal: "ZZ alias", level: "intermediate" }), "POST /v1/examples");
    expect(ex.daysPerWeek).toBe(2);
    ok(await call("GET", `/v1/examples?programId=${programId}`), "GET /v1/examples");
    expect((await call("DELETE", `/v1/examples/${ex.id}`)).status).toBeLessThan(300);
    routes.add("DELETE /v1/examples/:id");
  });

  test("logs, history, client pages, chains, notifications, admin, weekly message", async () => {
    const logs = ok(await call("GET", `/v1/logs/sessions?clientId=${clientId}`), "GET /v1/logs/sessions");
    expect(logs.map((l: any) => l.kind).sort()).toEqual(["cardio", "exercises", "exercises"]);
    ok(await call("GET", `/v1/logs/sessions?clientId=${clientId}&programId=${programId}`), "GET /v1/logs/sessions?programId");
    const history = ok(await call("GET", `/v1/logs/history?clientId=${clientId}`), "GET /v1/logs/history");
    expect(JSON.stringify(history)).toContain("100kg");
    const client = ok(await call("GET", `/v1/clients/${clientId}`), "GET /v1/clients/:id");
    expect(JSON.stringify(client)).toContain('"kind":"exercises"');
    ok(await call("GET", "/v1/clients/roster"), "GET /v1/clients/roster");
    ok(await call("GET", "/v1/clients"), "GET /v1/clients");
    ok(await call("GET", `/v1/chains/week?clientId=${clientId}`), "GET /v1/chains/week");
    ok(await call("GET", "/v1/notifications"), "GET /v1/notifications");
    ok(await call("GET", `/v1/admin/clients/${clientId}`), "GET /v1/admin/clients/:id");
    expect((await call("DELETE", `/v1/logs/sessions/${spareLogId}`)).status).toBe(204);
    routes.add("DELETE /v1/logs/sessions/:id");
    const msg = ok(await call("POST", "/v1/client-messages/generate", { clientId, programId, week: 1, providerId: "mock" }), "POST /v1/client-messages/generate");
    expect(msg.stats.sessionsLogged).toBe(2);
    expect(msg.stats.sets).toBe(2);
    ok(await call("GET", `/v1/client-messages?clientId=${clientId}`), "GET /v1/client-messages");
  });

  test("client portal: me, week and a client log", async () => {
    ok(await call("GET", "/v1/portal/me", undefined, portalToken), "GET /v1/portal/me");
    const wk = ok(await call("GET", "/v1/portal/week", undefined, portalToken), "GET /v1/portal/week");
    const sessions = wk.weeks[0].sessions;
    expect(sessions.map((s: any) => s.kind).sort()).toEqual(["cardio", "exercises", "exercises"]);
    // The trainer's old lifting log shows as done.
    expect(sessions.find((s: any) => s.id === ids.s1[0]).log).not.toBeNull();
    const saved = ok(
      await call(
        "POST",
        "/v1/portal/logs",
        { programSessionId: ids.s2[0], date: today, sets: [{ programExerciseId: ids.ex2[0], exerciseId: benchId, setNumber: 1, weightKg: 80, reps: 5 }] },
        portalToken
      ),
      "POST /v1/portal/logs"
    );
    expect(await rawText(sql`select kind as t from session_logs where id = ${saved.id}`)).toEqual(["exercises"]);
  });

  test("AI: generation reads, edit, chat, proposal build, generate and approve", async () => {
    const gen = ok(await call("GET", `/v1/ai/generations/${generationId}`), "GET /v1/ai/generations/:id");
    expect(gen.draft.weeks[0].sessions.some((s: any) => s.kind === "exercises")).toBe(true);
    ok(await call("GET", "/v1/ai/generations/pending"), "GET /v1/ai/generations/pending");
    ok(await call("GET", `/v1/ai/generations?clientId=${clientId}`), "GET /v1/ai/generations");
    ok(await call("GET", `/v1/ai/chat?clientId=${clientId}`), "GET /v1/ai/chat");
    ok(await call("POST", "/v1/ai/chat", { clientId, message: "Why this split?", providerId: "mock" }), "POST /v1/ai/chat");
    const built = ok(await call("POST", `/v1/ai/chat/proposals/${proposalMessageId}/build`, { providerId: "mock" }), "POST /v1/ai/chat/proposals/:id/build");
    const builtId = built.generation?.id ?? built.id;
    const edited = ok(await call("POST", `/v1/ai/generations/${builtId}/edit`, { ops: [{ op: "move", refs: [{ day: 1, slot: 1 }], dir: "down" }] }), "POST /v1/ai/generations/:id/edit");
    const editedId = edited.generation?.id ?? edited.id;
    ok(await call("POST", `/v1/ai/generations/${editedId}/revise`, { message: "Lighter week 1", providerId: "mock" }), "POST /v1/ai/generations/:id/revise");
    // Context reads the old program and logs.
    const next = ok(await call("POST", "/v1/ai/generate", { clientId, basedOnProgramId: programId, providerId: "mock" }), "POST /v1/ai/generate");
    expect(next.status).toBe("validated");
    ok(await call("POST", `/v1/ai/generations/${next.id}/reject`, {}), "POST /v1/ai/generations/:id/reject");
    // Approve the stored old draft: the new program is written with exercises.
    const approved = ok(await call("POST", `/v1/ai/generations/${generationId}/approve`, {}), "POST /v1/ai/generations/:id/approve");
    expect(approved.weeks[0].sessions.some((s: any) => s.kind === "exercises")).toBe(true);
    const [t] = await rawText(sql`select sessions::text as t from programs where id = ${approved.id}`);
    expect(t).not.toContain('"kind": "lifting"');
    expect(t).toContain('"kind": "exercises"');
  });

  test("AI: fill on an old program, stored old, applied as exercises", async () => {
    const fill = ok(await call("POST", "/v1/ai/fill", { clientId, basedOnProgramId: programId, providerId: "mock" }), "POST /v1/ai/fill");
    expect(fill.kind).toBe("fill");
    expect(fill.draft.weeks.filter((w: any) => w.locked).map((w: any) => w.week)).toEqual([1]);
    await db.execute(sql`update ai_generations set draft = ${toRelease1("draft")} where id = ${fill.id}`);
    const applied = ok(await call("POST", `/v1/ai/generations/${fill.id}/approve`, {}), "POST /v1/ai/generations/:id/approve (fill)");
    expect(applied.id).toBe(programId);
    expect(applied.weeks[3].sessions.filter((s: any) => s.kind === "exercises")).toHaveLength(2);
    const [t] = await rawText(sql`select sessions::text as t from programs where id = ${programId}`);
    expect(t).not.toContain('"kind": "lifting"');
  });

  test("imports: read, list and save history as exercises", async () => {
    const got = ok(await call("GET", `/v1/ai/imports/${importId}`), "GET /v1/ai/imports/:id");
    const kinds = got.result.weeks.flatMap((w: any) => w.days.flatMap((d: any) => d.sessions.map((s: any) => s.kind)));
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((k: string) => k === "exercises" || k === "cardio")).toBe(true);
    ok(await call("GET", `/v1/ai/imports?clientId=${clientId}`), "GET /v1/ai/imports");

    const picks: Record<string, string> = {};
    for (const w of got.result.weeks) for (const d of w.days) for (const s of d.sessions) for (const e of s.exercises) picks[historyExerciseKey(e.sourceName)] = squatId;
    const latestMonday = addDays(today, -(isoWeekday(today) - 1) - 7);
    const saved = ok(await call("POST", `/v1/ai/imports/${importId}/history`, { weekStarts: defaultWeekStarts(2, latestMonday), exercises: picks }), "POST /v1/ai/imports/:id/history");
    expect(saved.sessions).toBeGreaterThan(0);
    const rows = await rawText(sql`select sessions::text as t from programs where client_id = ${clientId} and status = 'archived'`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((t) => t.includes('"kind": "exercises"') && !t.includes('"kind": "lifting"'))).toBe(true);
    // the imported logs are new rows: exercises; only the untouched raw log is still lifting
    expect(await count(sql`select count(*) as n from session_logs where client_id = ${clientId} and kind = 'lifting'`)).toBe(1);
  });

  test("session types: list, rename and usage", async () => {
    const list = ok(await call("GET", "/v1/session-types"), "GET /v1/session-types");
    const mine = list.find((t: any) => t.id === typeId);
    expect(mine).toMatchObject({ format: "exercises" });
    expect(mine.usedIn).toBeGreaterThan(0);
    expect(list.find((t: any) => t.presetKey === "strength-training").format).toBe("exercises");
    expect(ok(await call("PATCH", `/v1/session-types/${typeId}`, { name: "ZZ Alias Type 2" }), "PATCH /v1/session-types/:id").format).toBe("exercises");
  });

  test("the editor saves what it read back: the program is stored as exercises", async () => {
    await db.execute(sql`update programs set sessions = ${toRelease1("sessions")} where id = ${programId}`);
    const got = ok(await call("GET", `/v1/programs/${programId}`), "GET /v1/programs/:id");
    const saved = ok(await call("PUT", `/v1/programs/${programId}`, { weeks: got.weeks }), "PUT /v1/programs/:id");
    expect(saved.weeks[0].sessions[0].kind).toBe("exercises");
    const [t] = await rawText(sql`select sessions::text as t from programs where id = ${programId}`);
    expect(t).not.toContain('"kind": "lifting"');
  });

  describe("a client that still writes lifting", () => {
    test("program create, save and status store exercises", async () => {
      const created = ok(await call("POST", "/v1/programs", { name: "R1 Block", clientId, weeks: [week(1)] }), "POST /v1/programs");
      expect(created.weeks[0].sessions.map((s: any) => s.kind)).toEqual(["exercises", "exercises", "cardio"]);
      const put = ok(await call("PUT", `/v1/programs/${created.id}`, { weeks: [week(1)] }), "PUT /v1/programs/:id (lifting)");
      expect(put.weeks[0].sessions[0].kind).toBe("exercises");
      ok(await call("PATCH", `/v1/programs/${created.id}/status`, { status: "archived" }), "PATCH /v1/programs/:id/status");
      const [t] = await rawText(sql`select sessions::text as t from programs where id = ${created.id}`);
      expect(t).not.toContain('"kind": "lifting"');
      expect(t).toContain('"kind": "exercises"');
    });

    test("trainer and portal logs store exercises", async () => {
      const log = ok(
        await call("POST", "/v1/logs/sessions", {
          clientId, programId, programSessionId: null, date: today, kind: "lifting",
          sets: [{ exerciseId: squatId, setNumber: 1, type: "working", weightKg: 60, reps: 8 }],
        }),
        "POST /v1/logs/sessions"
      );
      expect(log.kind).toBe("exercises");
      const portal = ok(
        await call(
          "POST",
          "/v1/portal/logs",
          { programSessionId: ids.s2[0], date: today, kind: "lifting", onDuplicate: "replace", sets: [{ programExerciseId: ids.ex2[0], exerciseId: benchId, setNumber: 1, weightKg: 82.5, reps: 5 }] },
          portalToken
        ),
        "POST /v1/portal/logs (lifting)"
      );
      expect(await rawText(sql`select kind as t from session_logs where id in (${log.id}, ${portal.id})`)).toEqual(["exercises", "exercises"]);
      // a bad kind is still a 422
      const bad = await call("POST", "/v1/logs/sessions", { clientId, programId, programSessionId: null, date: today, kind: "strength", sets: [] });
      expect(bad.status).toBe(422);
    });

    test("session type create and format change store exercises", async () => {
      const created = ok(await call("POST", "/v1/session-types", { name: `ZZ R1 ${crypto.randomUUID().slice(0, 6)}`, format: "lifting" }), "POST /v1/session-types");
      expect(created.format).toBe("exercises");
      expect(ok(await call("PATCH", `/v1/session-types/${created.id}`, { format: "cardio" }), "PATCH /v1/session-types/:id (cardio)").format).toBe("cardio");
      expect(ok(await call("PATCH", `/v1/session-types/${created.id}`, { format: "lifting" }), "PATCH /v1/session-types/:id (lifting)").format).toBe("exercises");
      expect(await rawText(sql`select format as t from session_types where id = ${created.id}`)).toEqual(["exercises"]);
      expect((await call("POST", "/v1/session-types", { name: "ZZ R1 bad", format: "strength" })).status).toBe(422);
      expect((await call("POST", "/v1/session-types", { name: "ZZ R1 any", format: "any" })).status).toBe(422);
      expect((await call("DELETE", `/v1/session-types/${created.id}`)).status).toBeLessThan(300);
      routes.add("DELETE /v1/session-types/:id");
    });
  });

  test("coverage: the old data went through at least 35 routes", () => {
    expect(routes.size).toBeGreaterThanOrEqual(35);
  });
});
