import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db, exercises, programs, trainers } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { getDefaultTrainerId } from "./lib/trainer";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping exercise library tests");
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

const uniq = () => `Lib Test ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const create = (over: Record<string, unknown> = {}) =>
  call("POST", "/v1/exercises", { name: uniq(), primaryMuscleGroup: "back", equipment: "dumbbell", ...over });

/** A draft program that prescribes `exerciseId` once. */
async function programUsing(exerciseId: string) {
  const trainerId = await getDefaultTrainerId();
  const [p] = await db
    .insert(programs)
    .values({
      trainerId,
      name: "usage fixture",
      sessions: [
        {
          week: 1,
          sessions: [
            {
              id: crypto.randomUUID(),
              name: "A",
              seq: 1,
              exercises: [
                { id: crypto.randomUUID(), exerciseId, order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5 }] },
              ],
            },
          ],
        },
      ] as any,
    })
    .returning();
  return p.id;
}

describe.skipIf(!dbUp)("exercise library", () => {
  test("create returns the full dto; exact duplicate names are refused", async () => {
    const name = uniq();
    const made = await create({ name, secondaryMuscleGroups: ["biceps", "back"], note: "  chest on pad  " });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({
      name,
      custom: true,
      archivedAt: null,
      usedIn: 0,
      note: "chest on pad",
      secondaryMuscleGroups: ["biceps"], // primary is never also secondary
    });
    const dupe = await create({ name: `  ${name.toUpperCase()} ` });
    expect(dupe.status).toBe(409);
  });

  test("unknown muscle, equipment or pattern is a validation error", async () => {
    expect((await create({ primaryMuscleGroup: "elbows" })).status).toBe(422);
    expect((await create({ equipment: "spaceship" })).status).toBe(422);
    expect((await create({ movementPattern: "sideways" })).status).toBe(422);
  });

  test("custom exercises are fully editable", async () => {
    const { body: ex } = await create();
    const name = uniq();
    const { status, body } = await call("PATCH", `/v1/exercises/${ex.id}`, {
      name,
      primaryMuscleGroup: "chest",
      equipment: "cable",
      movementPattern: "horizontal_push",
      functionalMovement: "push",
      note: "slow eccentric",
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ name, primaryMuscleGroup: "chest", equipment: "cable", movementPattern: "horizontal_push", note: "slow eccentric" });
  });

  test("seed entries: tags, note and hide are allowed; name/muscles/equipment are locked", async () => {
    const [seed] = await db.select().from(exercises).where(eq(exercises.name, "Bench Press"));
    const locked = await call("PATCH", `/v1/exercises/${seed.id}`, { name: "Renamed" });
    expect(locked.status).toBe(403);

    const tagged = await call("PATCH", `/v1/exercises/${seed.id}`, { note: "arch, feet planted", archived: true });
    expect(tagged.status).toBe(200);
    expect(tagged.body.custom).toBe(false);
    expect(tagged.body.archivedAt).not.toBeNull();

    const restored = await call("PATCH", `/v1/exercises/${seed.id}`, { note: null, archived: false });
    expect(restored.body).toMatchObject({ archivedAt: null, note: null });
    expect((await call("DELETE", `/v1/exercises/${seed.id}`)).status).toBe(403);
  });

  test("list reports program usage; used exercises archive instead of delete", async () => {
    const { body: ex } = await create();
    await programUsing(ex.id);
    await programUsing(ex.id);

    const list = await call("GET", `/v1/exercises?q=${encodeURIComponent(ex.name)}`);
    expect(list.body.find((e: any) => e.id === ex.id).usedIn).toBe(2);

    const refused = await call("DELETE", `/v1/exercises/${ex.id}`);
    expect(refused.status).toBe(409);

    const archived = await call("PATCH", `/v1/exercises/${ex.id}`, { archived: true });
    expect(archived.body.archivedAt).not.toBeNull();
    const still = await call("GET", `/v1/exercises?q=${encodeURIComponent(ex.name)}`);
    expect(still.body.map((e: any) => e.id)).toContain(ex.id); // programs can still resolve its name
  });

  test("unused custom exercises delete for good", async () => {
    const { body: ex } = await create();
    expect((await call("DELETE", `/v1/exercises/${ex.id}`)).status).toBe(204);
    const [gone] = await db.select().from(exercises).where(eq(exercises.id, ex.id));
    expect(gone).toBeUndefined();
    expect((await call("DELETE", `/v1/exercises/${ex.id}`)).status).toBe(404);
  });
});
