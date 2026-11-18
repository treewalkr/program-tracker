import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Migration 0067 (docs/kind-rename-plan.md, release 2) against a real Postgres:
 * a scratch database migrated to 0066 is seeded with release-1 data, then the
 * real migrator applies 0067. Every "lifting" in the three live stores becomes
 * "exercises"; cardio / "any" / everything else stays byte-identical; program
 * versions don't move; a second run changes nothing.
 */

const DRIZZLE = new URL("../drizzle/", import.meta.url).pathname;
const FILE = "0067_session_kind_exercises.sql";
const base = new URL(process.env.TEST_DATABASE_URL ?? "postgres://pt:pt_dev_password@localhost:5433/program_tracker_test");
const baseName = base.pathname.slice(1);
if (!/^[A-Za-z0-9_]+_test$/.test(baseName)) throw new Error(`refusing to run against "${baseName}": test database names must end in "_test"`);
const scratchName = `${baseName.replace(/_test$/, "")}_kind_backfill_test`;
const scratchUrl = new URL(base);
scratchUrl.pathname = `/${scratchName}`;
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";

let up = false;
try {
  const probe = postgres(adminUrl.toString(), { max: 1, connect_timeout: 5, onnotice: () => {} });
  await probe`select 1`;
  await probe.end();
  up = true;
} catch {
  console.warn("Postgres unreachable — skipping the 0067 backfill test");
}

const uuid = () => crypto.randomUUID();
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** The dry-run SELECT from the migration's leading comment, uncommented. */
function dryRun(): string {
  const file = readFileSync(join(DRIZZLE, FILE), "utf8");
  return file
    .slice(file.indexOf("--   SELECT"), file.indexOf("-- To rehearse"))
    .split("\n")
    .map((l) => l.replace(/^--\s{3}/, ""))
    .join("\n");
}

/** The expected program document: session objects' kind "lifting" → "exercises", nothing else. */
function expectedWeeks(doc: Json): Json {
  if (!Array.isArray(doc)) return doc;
  return doc.map((w) => {
    if (!w || typeof w !== "object" || Array.isArray(w) || !Array.isArray(w.sessions)) return w;
    return { ...w, sessions: w.sessions.map((s) => (s && typeof s === "object" && !Array.isArray(s) && s.kind === "lifting" ? { ...s, kind: "exercises" } : s)) };
  });
}

describe.skipIf(!up)("migration 0067: session kind lifting → exercises", () => {
  let sql: postgres.Sql;
  const trainer = uuid();
  const otherTrainer = uuid();
  const client = uuid();
  const typeLift = uuid();
  const set = (n: number) => ({ setNumber: n, type: "working", reps: 5, amrap: false, targetWeightKg: 100 });
  const exercise = (extra: Record<string, Json> = {}) => ({ id: uuid(), exerciseId: uuid(), order: 0, prescribedSets: [set(1), set(2)], ...extra });
  const lift = (seq: number, extra: Record<string, Json> = {}) => ({ id: uuid(), name: `Lift ${seq}`, seq, order: 0, weekday: seq, kind: "lifting", exercises: [exercise()], ...extra });
  const cardio = (seq: number) => ({ id: uuid(), name: "Easy run", seq, order: 1, weekday: 6, kind: "cardio", exercises: [], cardio: { modality: "Run", durationMin: 30, hrZone: 2 } });

  // Release-1 programs, each with its edge case.
  const programs: { id: string; name: string; version: number; sessions: Json; changes: boolean }[] = [
    {
      id: uuid(),
      name: "A/B block",
      version: 7,
      changes: true,
      sessions: [
        {
          week: 1,
          rotation: "A",
          sessions: [
            lift(1, { typeId: typeLift, typeName: "Hypertrophy", notes: "lifting day — keep it heavy" }),
            cardio(1),
            // a nested "kind" inside an exercise is not a session kind: untouched
            lift(2, { exercises: [exercise({ notes: "lifting", meta: { kind: "lifting" } })] }),
          ],
          targets: [{ kind: "lifting", value: 1 }],
        },
        { week: 2, rotation: "B", sessions: [lift(1), lift(2), lift(3), cardio(1)] },
        { week: 3, rotation: "A", sessions: [] },
        { week: 4, rotation: "B", deload: true, sessions: [lift(1), { ...cardio(1), kind: "cardio" }] },
      ],
    },
    {
      id: uuid(),
      name: "Mixed: no kind, weird weeks",
      version: 3,
      changes: true,
      sessions: [
        { week: 1, sessions: [(({ kind: _k, ...s }) => s)(lift(1)), lift(2)] },
        { week: 2, sessions: null },
        { week: 3 },
        "not a week",
        null,
        { week: 4, sessions: ["lifting", null, 3, { kind: null }, { kind: "Lifting" }, lift(1)] },
      ],
    },
    { id: uuid(), name: "Cardio only", version: 2, changes: false, sessions: [{ week: 1, sessions: [cardio(1), cardio(2)] }] },
    { id: uuid(), name: "No kind at all", version: 1, changes: false, sessions: [{ week: 1, sessions: [(({ kind: _k, ...s }) => s)(lift(1))] }] },
    { id: uuid(), name: "Empty", version: 1, changes: false, sessions: [] },
    { id: uuid(), name: "JSON null", version: 1, changes: false, sessions: null },
    { id: uuid(), name: "Already exercises", version: 4, changes: false, sessions: [{ week: 1, sessions: [{ ...lift(1), kind: "exercises" }, cardio(1)] }] },
  ];

  const logs: { id: string; kind: string }[] = [
    { id: uuid(), kind: "lifting" },
    { id: uuid(), kind: "lifting" },
    { id: uuid(), kind: "cardio" },
    { id: uuid(), kind: "exercises" },
  ];
  const types = [
    { id: typeLift, trainer, name: "Hypertrophy", format: "lifting", presetKey: null },
    { id: uuid(), trainer, name: "Strength training", format: "lifting", presetKey: "strength-training" },
    { id: uuid(), trainer, name: "Aerobic base", format: "cardio", presetKey: "cardiovascular.aerobic-base" },
    { id: uuid(), trainer, name: "Circuit", format: "any", presetKey: "metabolic.circuit" },
    { id: uuid(), trainer: otherTrainer, name: "Hypertrophy", format: "lifting", presetKey: null },
  ];

  type Snapshot = {
    programs: Map<string, { text: string; version: number; xmin: string; createdAt: string }>;
    logs: Map<string, { kind: string; xmin: string }>;
    types: Map<string, { format: string; xmin: string }>;
  };
  async function snapshot(): Promise<Snapshot> {
    const p = await sql<{ id: string; text: string; version: number; xmin: string; created_at: string }[]>`
      select id, sessions::text as text, version, xmin::text as xmin, created_at::text as created_at from programs`;
    const l = await sql<{ id: string; kind: string; xmin: string }[]>`select id, kind, xmin::text as xmin from session_logs`;
    const t = await sql<{ id: string; format: string; xmin: string }[]>`select id, format, xmin::text as xmin from session_types`;
    return {
      programs: new Map(p.map((r) => [r.id, { text: r.text, version: r.version, xmin: r.xmin, createdAt: r.created_at }])),
      logs: new Map(l.map((r) => [r.id, { kind: r.kind, xmin: r.xmin }])),
      types: new Map(t.map((r) => [r.id, { format: r.format, xmin: r.xmin }])),
    };
  }

  let before: Snapshot;
  let dryBefore: Record<string, string> = {};
  let after: Snapshot;
  let tmp = "";

  beforeAll(async () => {
    const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
    await admin.unsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${scratchName}"`);
    await admin.end();
    sql = postgres(scratchUrl.toString(), { max: 1, onnotice: () => {} });

    // Release-1 schema: every migration up to 0066.
    tmp = mkdtempSync(join(tmpdir(), "pt-kind-backfill-"));
    cpSync(DRIZZLE, tmp, { recursive: true });
    rmSync(join(tmp, FILE));
    const journal = JSON.parse(readFileSync(join(tmp, "meta/_journal.json"), "utf8"));
    journal.entries = journal.entries.filter((e: { tag: string }) => e.tag !== FILE.replace(/\.sql$/, ""));
    writeFileSync(join(tmp, "meta/_journal.json"), JSON.stringify(journal));
    await migrate(drizzle(sql), { migrationsFolder: tmp });
    const [{ d }] = await sql<{ d: string }[]>`select column_default as d from information_schema.columns where table_name = 'session_logs' and column_name = 'kind'`;
    expect(d).toBe("'lifting'::text");

    // Release-1 data, raw SQL (the drizzle column types would normalize it).
    await sql`insert into trainers (id, name, email) values (${trainer}, 'T', ${`t-${trainer}@test.dev`}), (${otherTrainer}, 'U', ${`u-${otherTrainer}@test.dev`})`;
    await sql`insert into clients (id, trainer_id, name) values (${client}, ${trainer}, 'C')`;
    for (const p of programs) {
      await sql`insert into programs (id, trainer_id, client_id, name, version, sessions) values (${p.id}, ${trainer}, ${client}, ${p.name}, ${p.version}, ${JSON.stringify(p.sessions)}::jsonb)`;
    }
    for (const l of logs) {
      await sql`insert into session_logs (id, client_id, program_id, date, kind) values (${l.id}, ${client}, ${programs[0].id}, '2026-11-16', ${l.kind})`;
    }
    // A release-1 insert that omits kind takes the old default.
    const [{ id: defaulted }] = await sql<{ id: string }[]>`insert into session_logs (client_id, program_id, date) values (${client}, ${programs[0].id}, '2026-11-17') returning id`;
    logs.push({ id: defaulted, kind: "lifting" });
    for (const t of types) {
      await sql`insert into session_types (id, trainer_id, name, format, preset_key) values (${t.id}, ${t.trainer}, ${t.name}, ${t.format}, ${t.presetKey})`;
    }

    before = await snapshot();
    dryBefore = (await sql.unsafe(dryRun()))[0] as Record<string, string>;
    // The real migrator, real folder: applies 0067 only.
    await migrate(drizzle(sql), { migrationsFolder: DRIZZLE });
    after = await snapshot();
  });

  afterAll(async () => {
    await sql?.end().catch(() => {});
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
    await admin.unsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`).catch(() => {});
    await admin.end();
  });

  test("the fixture is release-1 shaped", () => {
    expect([...before.logs.values()].filter((l) => l.kind === "lifting")).toHaveLength(3);
    expect([...before.types.values()].filter((t) => t.format === "lifting")).toHaveLength(3);
    expect(before.programs.get(programs[0].id)!.text).toContain('"kind": "lifting"');
  });

  test("session_logs: every lifting log is exercises, cardio untouched, new default", async () => {
    for (const l of logs) {
      const row = after.logs.get(l.id)!;
      expect(row.kind).toBe(l.kind === "lifting" ? "exercises" : l.kind);
      if (l.kind !== "lifting") expect(row.xmin).toBe(before.logs.get(l.id)!.xmin);
    }
    const [{ d }] = await sql<{ d: string }[]>`select column_default as d from information_schema.columns where table_name = 'session_logs' and column_name = 'kind'`;
    expect(d).toBe("'exercises'::text");
    const [{ kind }] = await sql<{ kind: string }[]>`insert into session_logs (client_id, program_id, date) values (${client}, ${programs[0].id}, '2026-11-18') returning kind`;
    expect(kind).toBe("exercises");
  });

  test("session_types: lifting → exercises for every trainer, cardio and any untouched", () => {
    for (const t of types) {
      const row = after.types.get(t.id)!;
      expect(row.format).toBe(t.format === "lifting" ? "exercises" : t.format);
      if (t.format !== "lifting") expect(row.xmin).toBe(before.types.get(t.id)!.xmin);
    }
  });

  test("programs: each session's kind converted, every other byte identical, version unchanged", async () => {
    for (const p of programs) {
      const b = before.programs.get(p.id)!;
      const a = after.programs.get(p.id)!;
      expect(a.version).toBe(p.version);
      expect(a.createdAt).toBe(b.createdAt);
      const [{ want }] = await sql<{ want: string }[]>`select ${JSON.stringify(expectedWeeks(p.sessions))}::jsonb::text as want`;
      expect(a.text).toBe(want);
      if (p.changes) {
        expect(a.text).not.toBe(b.text);
        expect(a.text).not.toMatch(/"kind": "lifting", "name": "Lift/);
      } else {
        expect(a.text).toBe(b.text);
        expect(a.xmin).toBe(b.xmin); // the row was not even rewritten
      }
    }
  });

  test("programs: the converted sessions, by count, and what deliberately stays", () => {
    const ab = JSON.parse(after.programs.get(programs[0].id)!.text);
    expect(ab.map((w: any) => w.sessions.map((s: any) => s.kind))).toEqual([
      ["exercises", "cardio", "exercises"],
      ["exercises", "exercises", "exercises", "cardio"],
      [],
      ["exercises", "cardio"],
    ]);
    expect(ab.map((w: any) => w.rotation)).toEqual(["A", "B", "A", "B"]);
    // not session kinds: an exercise's nested kind, a week target's kind, free text
    expect(ab[0].sessions[2].exercises[0].meta).toEqual({ kind: "lifting" });
    expect(ab[0].sessions[2].exercises[0].notes).toBe("lifting");
    expect(ab[0].targets).toEqual([{ kind: "lifting", value: 1 }]);
    expect(ab[0].sessions[0].notes).toBe("lifting day — keep it heavy");

    const mixed = JSON.parse(after.programs.get(programs[1].id)!.text);
    expect("kind" in mixed[0].sessions[0]).toBe(false);
    expect(mixed[0].sessions[1].kind).toBe("exercises");
    expect(mixed.slice(1, 5)).toEqual([{ week: 2, sessions: null }, { week: 3 }, "not a week", null]);
    expect(mixed[5].sessions.slice(0, 5)).toEqual(["lifting", null, 3, { kind: null }, { kind: "Lifting" }]);
    expect(mixed[5].sessions[5].kind).toBe("exercises");
  });

  test("no session-level lifting left anywhere", async () => {
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from programs p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.sessions) = 'array' then p.sessions else '[]'::jsonb end) w
      cross join lateral jsonb_array_elements(case when jsonb_typeof(w->'sessions') = 'array' then w->'sessions' else '[]'::jsonb end) s
      where s->>'kind' = 'lifting'`;
    expect(n).toBe(0);
    expect((await sql`select 1 from session_logs where kind = 'lifting'`).length).toBe(0);
    expect((await sql`select 1 from session_types where format = 'lifting'`).length).toBe(0);
  });

  test("idempotent: running the statements again changes nothing", async () => {
    const statements = readFileSync(join(DRIZZLE, FILE), "utf8").split("--> statement-breakpoint");
    expect(statements).toHaveLength(4);
    await sql.begin(async (tx) => {
      for (const s of statements) await tx.unsafe(s);
    });
    const again = await snapshot();
    for (const [id, p] of after.programs) {
      expect(again.programs.get(id)!.text).toBe(p.text);
      expect(again.programs.get(id)!.xmin).toBe(p.xmin);
    }
    for (const [id, l] of after.logs) expect(again.logs.get(id)!.xmin).toBe(l.xmin);
    for (const [id, t] of after.types) expect(again.types.get(id)!.xmin).toBe(t.xmin);
  });

  test("the commented dry-run count matches what 0067 touched, and reads 0 after", async () => {
    expect(dryRun()).toStartWith("SELECT");
    // 2 + 1 defaulted logs; 3 types; 2 programs holding 6 + 2 lifting sessions
    expect(dryBefore).toEqual({ session_logs: "3", session_types: "3", programs: "2", program_sessions: "8" });
    const now = (await sql.unsafe(dryRun()))[0] as Record<string, string>;
    expect({ ...now }).toEqual({ session_logs: "0", session_types: "0", programs: "0", program_sessions: "0" });
  });
});
