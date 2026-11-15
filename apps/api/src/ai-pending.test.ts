import { afterAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { aiGenerations, clients, db, trainers } from "@pt/db";
import { STALE_PENDING_MS } from "@pt/shared";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { getDefaultTrainerId } from "./lib/trainer";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ id: trainers.id }).from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping pending generations tests");
}

const get = async (path: string) => {
  const res = await app.handle(new Request(`http://local${path}`));
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

const trainerIds: string[] = [];

afterAll(async () => {
  if (!dbUp || trainerIds.length === 0) return;
  // Clients and generations cascade with their trainer.
  await db.delete(trainers).where(inArray(trainers.id, trainerIds));
});

describe.skipIf(!dbUp)("GET /v1/ai/generations/pending", () => {
  test("lists only this trainer's live pending rows, without drafts", async () => {
    const me = await getDefaultTrainerId();
    const stamp = Date.now();
    const [mine] = await db
      .insert(clients)
      .values({ trainerId: me, name: "ZZ-TEST Pending Ada", email: `zz-pending-${stamp}@test.dev` })
      .returning();
    const [other] = await db
      .insert(trainers)
      .values({ name: "ZZ-TEST Pending Other", email: `zz-pending-other-${stamp}@test.dev` })
      .returning();
    trainerIds.push(other.id);
    const [theirs] = await db
      .insert(clients)
      .values({ trainerId: other.id, name: "ZZ-TEST Not mine", email: `zz-pending-nm-${stamp}@test.dev` })
      .returning();

    const row = { providerId: "mock", model: "mock-draft-v1" } as const;
    const inserted = await db
      .insert(aiGenerations)
      .values([
        { ...row, trainerId: me, clientId: mine.id, status: "pending", kind: "week", targetWeek: 3 },
        { ...row, trainerId: me, clientId: mine.id, status: "validated" },
        // Older than the stale cutoff: the AI call never settled it.
        { ...row, trainerId: me, clientId: mine.id, status: "pending", createdAt: new Date(stamp - STALE_PENDING_MS - 60_000) },
        { ...row, trainerId: other.id, clientId: theirs.id, status: "pending" },
      ])
      .returning();

    try {
      const { status, body } = await get("/v1/ai/generations/pending");
      expect(status).toBe(200);
      const ids = (body as { id: string }[]).map((g) => g.id);
      expect(ids).toContain(inserted[0].id);
      expect(ids).not.toContain(inserted[1].id);
      expect(ids).not.toContain(inserted[2].id);
      expect(ids).not.toContain(inserted[3].id);

      const live = body.find((g: { id: string }) => g.id === inserted[0].id);
      expect(Object.keys(live).sort()).toEqual(["clientId", "clientName", "createdAt", "id", "kind", "targetWeek"]);
      expect(live).toMatchObject({ clientId: mine.id, clientName: "ZZ-TEST Pending Ada", kind: "week", targetWeek: 3 });
      expect(body.length).toBeLessThanOrEqual(20);
    } finally {
      await db.delete(aiGenerations).where(inArray(aiGenerations.id, inserted.map((g) => g.id)));
      await db.delete(clients).where(inArray(clients.id, [mine.id]));
    }
  });
});
