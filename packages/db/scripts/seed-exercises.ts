/**
 * Seed the global exercise library from library/exercise-library.json
 * (free-exercise-db, public domain, plus hand curation — see library/).
 *
 *   bun run seed:exercises            run seed/exercises.sql: add missing library
 *                                     names (idempotent)
 *   bun run seed:exercises --replace  delete EVERY exercise (library + custom),
 *                                     insert the library, and remap program and
 *                                     AI-draft references by name / ALIASES.
 *                                     Aborts (rolls back) if any set log exists
 *                                     or any reference can't be mapped.
 */
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { aiGenerations, db, exercises, programs, setLogs } from "../src";
import { ALIASES, type LibraryEntry } from "../library/curation";
import library from "../library/exercise-library.json";

const entries = library as LibraryEntry[];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const aliasByNorm = new Map(Object.entries(ALIASES).map(([from, to]) => [norm(from), to]));

/** Replace every string in `value` found in `map`; collect strings that look like old ids but aren't mapped. */
function remap(value: unknown, map: Map<string, string>, oldIds: Set<string>, missing: Set<string>): unknown {
  if (typeof value === "string") {
    if (map.has(value)) return map.get(value);
    if (oldIds.has(value)) missing.add(value);
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => remap(v, map, oldIds, missing));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v, map, oldIds, missing)]));
  return value;
}

const toRow = (e: LibraryEntry) => ({ ...e, trainerId: null });

async function addMissing() {
  const count = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(exercises))[0].n;
  const before = await count();
  await db.execute(sql.raw(readFileSync(new URL("../seed/exercises.sql", import.meta.url), "utf8")));
  console.log(`✓ added ${(await count()) - before} exercises from seed/exercises.sql`);
}

async function replaceAll() {
  await db.transaction(async (tx) => {
    const [{ logs }] = await tx.select({ logs: sql<number>`count(*)::int` }).from(setLogs);
    if (logs > 0) throw new Error(`${logs} set logs reference exercises; refusing to delete`);

    const old = await tx.select({ id: exercises.id, name: exercises.name }).from(exercises);
    await tx.delete(exercises);
    const inserted = await tx.insert(exercises).values(entries.map(toRow)).returning({ id: exercises.id, name: exercises.name });
    const newIdByName = new Map(inserted.map((e) => [e.name, e.id]));
    const newIdByNorm = new Map(inserted.map((e) => [norm(e.name), e.id]));

    const map = new Map<string, string>();
    for (const o of old) {
      const alias = aliasByNorm.get(norm(o.name));
      const id = alias ? newIdByName.get(alias) : newIdByNorm.get(norm(o.name));
      if (id) map.set(o.id, id);
    }
    const oldIds = new Set(old.map((o) => o.id));
    const nameOf = new Map(old.map((o) => [o.id, o.name]));
    const missing = new Set<string>();

    const progs = await tx.select({ id: programs.id, sessions: programs.sessions }).from(programs);
    const gens = await tx.select({ id: aiGenerations.id, draft: aiGenerations.draft }).from(aiGenerations);
    const progUpdates = progs.map((p) => ({ id: p.id, sessions: remap(p.sessions, map, oldIds, missing) }));
    const genUpdates = gens.filter((g) => g.draft).map((g) => ({ id: g.id, draft: remap(g.draft, map, oldIds, missing) }));
    if (missing.size)
      throw new Error(`unmapped exercises still referenced: ${[...missing].map((id) => nameOf.get(id)).join(", ")} — add them to ALIASES`);

    for (const p of progUpdates) await tx.update(programs).set({ sessions: p.sessions as never }).where(eq(programs.id, p.id));
    for (const g of genUpdates) await tx.update(aiGenerations).set({ draft: g.draft as never }).where(eq(aiGenerations.id, g.id));
    console.log(
      `✓ replaced ${old.length} exercises with ${inserted.length}; remapped ${progUpdates.length} programs and ${genUpdates.length} AI drafts`
    );
  });
}

(process.argv.includes("--replace") ? replaceAll() : addMissing())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("seed failed:", err.message ?? err);
    process.exit(1);
  });
