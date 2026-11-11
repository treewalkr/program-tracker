import { describe, expect, test, afterAll } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db, trainers, clients, programs, sessionLogs } from "@pt/db";
import { localDateOf } from "@pt/shared";
import { getDefaultTrainerId } from "./lib/trainer";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping client email tests");
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

describe.skipIf(!dbUp)("optional client email", () => {
  const ids: string[] = [];
  afterAll(async () => {
    if (ids.length) await db.delete(clients).where(inArray(clients.id, ids));
  });

  test("create without an email stores null", async () => {
    const { status, body } = await call("POST", "/v1/clients", { name: "No Email" });
    expect(status).toBe(201);
    expect(body.email).toBeNull();
    ids.push(body.id);
  });

  test("an empty email is stored as null; a malformed one is refused", async () => {
    const empty = await call("POST", "/v1/clients", { name: "Blank Email", email: "" });
    expect(empty.status).toBe(201);
    expect(empty.body.email).toBeNull();
    ids.push(empty.body.id);
    expect((await call("POST", "/v1/clients", { name: "Bad", email: "not-an-email" })).status).toBe(422);
  });

  test("update can set and then clear the email", async () => {
    const id = ids[0];
    const set = await call("PATCH", `/v1/clients/${id}`, { email: "ada@gym.com" });
    expect(set.status).toBe(200);
    expect(set.body.email).toBe("ada@gym.com");
    const cleared = await call("PATCH", `/v1/clients/${id}`, { email: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.email).toBeNull();
    const blank = await call("PATCH", `/v1/clients/${id}`, { email: "ada@gym.com" });
    expect(blank.body.email).toBe("ada@gym.com");
    expect((await call("PATCH", `/v1/clients/${id}`, { email: "" })).body.email).toBeNull();
  });
});

describe.skipIf(!dbUp)("client basics", () => {
  const ids: string[] = [];
  afterAll(async () => {
    if (ids.length) await db.delete(clients).where(inArray(clients.id, ids));
  });

  const basics = {
    experience: "intermediate",
    birthDate: "1992-03-14",
    sex: "female",
    bodyweightKg: 72.5,
    heightCm: 168,
    startedOn: "2026-01-05",
    phone: "  +66 81 234 5678 ",
  };

  test("create stores every basic; dates stay calendar days; phone is trimmed", async () => {
    const { status, body } = await call("POST", "/v1/clients", { name: "Basics", ...basics });
    expect(status).toBe(201);
    ids.push(body.id);
    expect(body).toMatchObject({ ...basics, phone: "+66 81 234 5678" });
    const read = await call("GET", `/v1/clients/${body.id}`);
    expect(read.body.client.birthDate).toBe("1992-03-14");
    expect(read.body.client.startedOn).toBe("2026-01-05");
  });

  test("a client without basics reads them as null", async () => {
    const { body } = await call("POST", "/v1/clients", { name: "Bare" });
    ids.push(body.id);
    for (const key of Object.keys(basics)) expect(body[key]).toBeNull();
  });

  test("update sets and clears basics; a blank phone is null", async () => {
    const id = ids[0];
    const patched = await call("PATCH", `/v1/clients/${id}`, { experience: "advanced", heightCm: null, phone: "  " });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ experience: "advanced", heightCm: null, phone: null, sex: "female" });
  });

  test("out-of-range values are refused", async () => {
    const bad = [
      { experience: "elite" },
      { sex: "other" },
      { bodyweightKg: 19 },
      { bodyweightKg: 401 },
      { heightCm: 79 },
      { heightCm: 251 },
      { birthDate: "1899-12-31" },
      { birthDate: "2999-01-01" },
      { birthDate: "14/03/1992" },
      { startedOn: "1999-12-31" },
      { startedOn: "2999-01-01" },
      { phone: "1".repeat(41) },
    ];
    for (const fields of bad) {
      const res = await call("POST", "/v1/clients", { name: "Bad", ...fields });
      expect([res.status, fields]).toEqual([422, fields]);
    }
    const patch = await call("PATCH", `/v1/clients/${ids[0]}`, { birthDate: "2999-01-01" });
    expect(patch.status).toBe(422);
  });
});

describe.skipIf(!dbUp)("client roster", () => {
  const tok = `rstr${crypto.randomUUID().slice(0, 8)}`;
  const DAY = 86_400_000;
  const day = (ago: number) => localDateOf(Date.now() - ago * DAY);
  const ids: Record<string, string> = {};
  let otherTrainerId = "";
  let adaProgramId = "";
  const roster = (params: Record<string, string | number> = {}) =>
    call("GET", `/v1/clients/roster?${new URLSearchParams({ q: tok, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })}`);
  const names = (body: { items: { name: string }[] }) => body.items.map((i) => i.name.replace(` ${tok}`, ""));

  afterAll(async () => {
    await db.delete(clients).where(inArray(clients.id, Object.values(ids)));
    if (otherTrainerId) await db.delete(trainers).where(eq(trainers.id, otherTrainerId));
  });

  test("setup: 12 clients for me, one for another trainer", async () => {
    const me = await getDefaultTrainerId();
    const base = Date.now() - 100 * DAY;
    const rows: { name: string; status?: "active" | "paused" | "archived"; email?: string }[] = [
      { name: "Ada" },
      { name: "Bea" },
      { name: "Cy", status: "paused" },
      { name: "Dee", status: "archived" },
      ...Array.from({ length: 8 }, (_, i) => ({ name: `Zed0${i + 1}` })),
    ];
    for (const [i, r] of rows.entries()) {
      const [c] = await db
        .insert(clients)
        .values({ trainerId: me, name: `${r.name} ${tok}`, status: r.status ?? "active", createdAt: new Date(base + i * DAY) })
        .returning();
      ids[r.name] = c.id;
    }
    // Found by email only (name lacks the token).
    const [byEmail] = await db
      .insert(clients)
      .values({ trainerId: me, name: "Mailonly", email: `mail.${tok}@gym.com`, createdAt: new Date(base - DAY) })
      .returning();
    ids.Mailonly = byEmail.id;

    const weeks = Array.from({ length: 6 }, (_, i) => ({ week: i + 1, sessions: [] })) as never;
    const [ada] = await db
      .insert(programs)
      .values({ trainerId: me, clientId: ids.Ada, name: "Hypertrophy", status: "active", sessions: weeks, activatedAt: new Date(Date.now() - 10 * DAY) })
      .returning();
    adaProgramId = ada.id;
    const pain = (exerciseId: string) => ({ programExerciseId: null, exerciseId, kind: "pain" as const });
    await db.insert(sessionLogs).values([
      { clientId: ids.Ada, programId: ada.id, date: day(1), flags: [pain(crypto.randomUUID()), pain(crypto.randomUUID())] },
      { clientId: ids.Ada, programId: ada.id, date: day(3) },
    ]);
    const [old] = await db
      .insert(programs)
      .values({ trainerId: me, clientId: ids.Bea, name: "Old block", status: "draft", sessions: weeks })
      .returning();
    await db.insert(sessionLogs).values({ clientId: ids.Bea, programId: old.id, date: day(20) });

    const [other] = await db.insert(trainers).values({ name: "Other", email: `${tok}@other.dev` }).returning();
    otherTrainerId = other.id;
    await db.insert(clients).values({ trainerId: other.id, name: `Eve ${tok}`, email: `eve.${tok}@gym.com` });
  });

  test("first page: 10 rows, totals and counts; actives by name, then paused, then archived", async () => {
    const { status, body } = await roster();
    expect(status).toBe(200);
    expect(body.total).toBe(13);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(10);
    expect(body.counts).toEqual({ all: 13, active: 11, paused: 1, archived: 1 });
    expect(names(body)).toEqual(["Ada", "Bea", "Mailonly", "Zed01", "Zed02", "Zed03", "Zed04", "Zed05", "Zed06", "Zed07"]);
    const second = await roster({ page: 2 });
    expect(names(second.body)).toEqual(["Zed08", "Cy", "Dee"]);
  });

  test("a page past the end clamps to the last page", async () => {
    const { body } = await roster({ page: 9 });
    expect(body.page).toBe(2);
    expect(body.items).toHaveLength(3);
  });

  test("limit is one of 10/25/50", async () => {
    const { body } = await roster({ limit: 25 });
    expect(body.items).toHaveLength(13);
    expect(body.limit).toBe(25);
    expect((await roster({ limit: 20 })).status).toBe(422);
    expect((await roster({ limit: "lots" })).status).toBe(422);
    expect((await roster({ page: 0 })).status).toBe(422);
    expect((await roster({ status: "gone" })).status).toBe(422);
  });

  test("each status filters rows; counts ignore the status", async () => {
    for (const [s, expected] of [
      ["active", 11],
      ["paused", 1],
      ["archived", 1],
      ["all", 13],
    ] as const) {
      const { body } = await roster({ status: s, limit: 50 });
      expect(body.total).toBe(expected);
      expect(body.items).toHaveLength(expected);
      expect(body.counts.all).toBe(13);
    }
    expect(names((await roster({ status: "paused" })).body)).toEqual(["Cy"]);
    expect(names((await roster({ status: "archived" })).body)).toEqual(["Dee"]);
  });

  test("q matches name or email; counts follow q; wildcards are literal", async () => {
    const byName = await call("GET", `/v1/clients/roster?q=${encodeURIComponent(`ada ${tok}`)}`);
    expect(byName.body.items.map((i: { id: string }) => i.id)).toEqual([ids.Ada]);
    expect(byName.body.counts).toEqual({ all: 1, active: 1, paused: 0, archived: 0 });
    const byEmail = await call("GET", `/v1/clients/roster?q=${encodeURIComponent(`mail.${tok}`)}`);
    expect(byEmail.body.items.map((i: { id: string }) => i.id)).toEqual([ids.Mailonly]);
    expect((await call("GET", `/v1/clients/roster?q=${encodeURIComponent(`${tok}%`)}`)).body.total).toBe(0);
    expect((await call("GET", `/v1/clients/roster?q=${"x".repeat(101)}`)).status).toBe(422);
  });

  test("sort=last: most recent session first, never-trained last", async () => {
    const { body } = await roster({ sort: "last", limit: 50 });
    expect(names(body).slice(0, 2)).toEqual(["Ada", "Bea"]);
    expect(body.items.slice(2).every((i: { lastSessionAt: string | null }) => i.lastSessionAt === null)).toBe(true);
    expect(names(body).slice(2)).toEqual(["Cy", "Dee", "Mailonly", ...Array.from({ length: 8 }, (_, i) => `Zed0${i + 1}`)]);
  });

  test("sort=recent: newest client first", async () => {
    const { body } = await roster({ sort: "recent", limit: 50 });
    expect(names(body)).toEqual(["Zed08", "Zed07", "Zed06", "Zed05", "Zed04", "Zed03", "Zed02", "Zed01", "Dee", "Cy", "Bea", "Ada", "Mailonly"]);
  });

  test("rows carry last session, active program with block week, and open-signal count", async () => {
    const { body } = await roster({ limit: 50 });
    const ada = body.items.find((i: { id: string }) => i.id === ids.Ada);
    expect(ada.lastSessionAt).toBe(day(1));
    expect(ada.program).toEqual({ id: adaProgramId, name: "Hypertrophy", week: 2, weeks: 6 });
    const bea = body.items.find((i: { id: string }) => i.id === ids.Bea);
    expect(bea.lastSessionAt).toBe(day(20));
    expect(bea.program).toBeNull();
    expect(bea.attention).toBe(0);

    const feed = (await call("GET", "/v1/notifications")).body.signals.filter((s: { clientId: string }) => s.clientId === ids.Ada);
    expect(feed.length).toBeGreaterThanOrEqual(2);
    expect(ada.attention).toBe(feed.length);

    const pain = feed.find((s: { kind: string }) => s.kind === "pain-flag");
    await call("PUT", `/v1/notifications/${encodeURIComponent(pain.id)}/snooze`, { until: new Date(Date.now() + DAY).toISOString() });
    const after = (await roster({ limit: 50 })).body.items.find((i: { id: string }) => i.id === ids.Ada);
    expect(after.attention).toBe(feed.length - 1);
  });

  test("never lists another trainer's clients", async () => {
    const { body } = await roster({ limit: 50 });
    expect(body.items.some((i: { name: string }) => i.name.startsWith("Eve"))).toBe(false);
    const byEmail = await call("GET", `/v1/clients/roster?q=${encodeURIComponent(`eve.${tok}`)}`);
    expect(byEmail.body.total).toBe(0);
    expect(byEmail.body.items).toEqual([]);
  });
});
