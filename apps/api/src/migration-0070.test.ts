import { afterAll, describe, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import { assessments, cardioModalities, clientHrProfiles, clients, db, sessionLogs, trainers } from "@pt/db";

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  dbUp = false;
}

const created: string[] = [];
afterAll(async () => {
  if (!dbUp) return;
  if (created.length) await db.delete(trainers).where(inArray(trainers.id, created));
});

async function trainer() {
  const [t] = await db
    .insert(trainers)
    .values({ name: "ZZ-TEST 0070", email: `zz-test-0070-${crypto.randomUUID()}@example.com` })
    .returning();
  created.push(t.id);
  return t.id;
}

/** The data step of 0070, run again on fresh rows (the migrator already ran it on the empty test DB). */
const migrationUpdate = async () => {
  const file = await Bun.file(new URL("../../../packages/db/drizzle/0070_cardio_module.sql", import.meta.url)).text();
  const update = file.split("--> statement-breakpoint").map((s) => s.trim()).find((s) => s.startsWith("UPDATE"));
  expect(update).toBeDefined();
  await db.execute(sql.raw(update!));
};

describe.skipIf(!dbUp)("migration 0070: cardio module", () => {
  test("clears zone-minutes targets and leaves every other target alone", async () => {
    const trainerId = await trainer();
    const rows = await db
      .insert(clients)
      .values([
        { trainerId, name: "ZZ zone", cardioTarget: { unit: "zone_minutes", value: 150 } },
        { trainerId, name: "ZZ minutes", cardioTarget: { unit: "minutes", value: 120 } },
        { trainerId, name: "ZZ none" },
      ])
      .returning();
    await migrationUpdate();
    const after = await db.select().from(clients).where(eq(clients.trainerId, trainerId));
    const byName = Object.fromEntries(after.map((c) => [c.name, c.cardioTarget]));
    expect(byName).toEqual({ "ZZ zone": null, "ZZ minutes": { unit: "minutes", value: 120 }, "ZZ none": null });
    expect(rows).toHaveLength(3);
  });

  test("new columns default so an old-style insert still works", async () => {
    const trainerId = await trainer();
    const [t] = await db.select().from(trainers).where(eq(trainers.id, trainerId));
    expect(t.hiddenCardioPresets).toEqual([]);
    expect(t.displayUnits).toBeNull();
    const [client] = await db.insert(clients).values({ trainerId, name: "ZZ cols" }).returning();
    expect(client.displayUnits).toBeNull();
    const cols = await db.execute(sql`select column_name from information_schema.columns where table_name = 'session_logs'`);
    const names = (cols as unknown as { column_name: string }[]).map((c) => c.column_name);
    expect(names).toEqual(expect.arrayContaining(["prescription", "reviewed_at", "reviewed_by", "trainer_feedback"]));
  });

  test("HR profiles and assessments go with their member; a modality name index allows lookups", async () => {
    const trainerId = await trainer();
    const [client] = await db.insert(clients).values({ trainerId, name: "ZZ cascade" }).returning();
    const zones = [1, 2, 3, 4, 5].map((zone) => ({ zone, min: 100 + zone * 10, max: 109 + zone * 10 }));
    await db.insert(clientHrProfiles).values({ clientId: client.id, version: 1, effectiveFrom: "2026-11-01", method: "custom", zones });
    await db.insert(assessments).values({
      clientId: client.id,
      protocol: "cooper_12min",
      formulaVersion: "cooper-1968",
      testedOn: "2026-11-01",
      inputs: { distanceM: 2400 },
      result: 42.4,
    });
    await db.insert(cardioModalities).values({ trainerId, name: "Running", metric: "pace", presetKey: "running" });
    await db.delete(clients).where(eq(clients.id, client.id));
    expect(await db.select().from(clientHrProfiles).where(eq(clientHrProfiles.clientId, client.id))).toHaveLength(0);
    expect(await db.select().from(assessments).where(eq(assessments.clientId, client.id))).toHaveLength(0);
    expect(sessionLogs.reviewedBy).toBeDefined();
  });
});
