import { describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db, llmBlobs, llmCalls, trainers } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping chat grounding tests");
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

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

async function setup(name: string) {
  const client = await call("POST", "/v1/clients", {
    name,
    email: `grounding-${crypto.randomUUID()}@test.dev`,
    sessionsPerWeek: 2,
    cardioTarget: { unit: "sessions", value: 4 },
  });
  expect(client.status).toBe(201);
  const [squat] = (await call("GET", "/v1/exercises?q=squat")).body;
  const squatId = squat.id as string;
  const sessionId = crypto.randomUUID();
  const program = await call("POST", "/v1/programs", {
    name: "Grounding Block",
    clientId: client.body.id,
    weeks: [
      {
        week: 1,
        sessions: [
          {
            id: sessionId,
            name: "Lower",
            seq: 1,
            order: 0,
            kind: "lifting",
            exercises: [
              {
                id: crypto.randomUUID(),
                exerciseId: squatId,
                order: 0,
                prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false, targetRpe: 8 }],
              },
            ],
          },
        ],
      },
    ],
  });
  expect(program.status).toBe(201);
  await call("PATCH", `/v1/programs/${program.body.id}/status`, { status: "active" });
  return { clientId: client.body.id as string, programId: program.body.id as string, squatId, squatName: squat.name as string, sessionId };
}

async function chatTurn(clientId: string, message: string) {
  const res = await call("POST", "/v1/ai/chat", { clientId, message, providerId: "mock" });
  expect(res.status).toBe(201);
  const [row] = await db.select().from(llmCalls).where(eq(llmCalls.chatMessageId, res.body.messages[1].id));
  const blobs = await db
    .select()
    .from(llmBlobs)
    .where(inArray(llmBlobs.sha256, row.requestBlobIds.map((b) => b.sha)));
  return {
    reply: res.body.messages[1].content as string,
    context: row.context as Record<string, unknown>,
    prompt: blobs.map((b) => b.content).join("\n"),
  };
}

describe.skipIf(!dbUp)("chat grounding (F11)", () => {
  test("cardio-only client: the chat sees every run, dated, and is told not to call it a cold start", async () => {
    const { clientId, programId } = await setup("ZZ-TEST Priya");
    for (const [n, min] of [[6, 30], [4, 35], [2, 40]] as const) {
      const res = await call("POST", "/v1/logs/sessions", {
        clientId,
        programId,
        date: daysAgo(n),
        kind: "cardio",
        cardio: { modality: "Run", durationMin: min, hrZone: 2, distanceKm: 5 },
        sets: [],
      });
      expect(res.status).toBe(201);
    }

    const { reply, context, prompt } = await chatTurn(clientId, "Is she hitting her cardio target?");
    const log = context.trainingLog as string;
    expect(log.split("\n")).toEqual([
      `${daysAgo(2)} Cardio: Run 40 min, zone 2, 5 km`,
      `${daysAgo(4)} Cardio: Run 35 min, zone 2, 5 km`,
      `${daysAgo(6)} Cardio: Run 30 min, zone 2, 5 km`,
    ]);
    expect(prompt).toContain(`TRAINING LOG (dated, newest first — every logged set and cardio session, last 8 weeks):\n${log}`);
    expect(prompt).toContain("never say there are no completed sessions");
    expect(prompt).not.toContain("RECENT TRAINING LOGS: none.");
    // The mock reply is grounded too: it cites the newest dated entry.
    expect(reply).toContain(`Latest logged: ${daysAgo(2)} Cardio: Run 40 min`);
    expect(reply).not.toMatch(/no completed sessions|cold start/i);
  });

  test("lifting client: back-offs appear per session under the program's session label", async () => {
    const { clientId, programId, squatId, squatName, sessionId } = await setup("ZZ-TEST Daniel");
    const res = await call("POST", "/v1/logs/sessions", {
      clientId,
      programId,
      programSessionId: sessionId,
      date: daysAgo(3),
      sets: [
        { exerciseId: squatId, setNumber: 1, type: "working", weightKg: 140, reps: 5, rpe: 9 },
        { exerciseId: squatId, setNumber: 2, type: "working", weightKg: 140, reps: 5, rpe: 9 },
        { exerciseId: squatId, setNumber: 3, type: "backoff", weightKg: 137.5, reps: 4, rpe: 9.5 },
      ],
    });
    expect(res.status).toBe(201);

    const { context } = await chatTurn(clientId, "Is his squat RPE creeping?");
    expect(context.trainingLog).toBe(
      `${daysAgo(3)} Session 1 (Lower): ${squatName} 140×5@9, 140×5@9, 137.5×4@9.5 (back-off)`
    );
  });

  test("no logs: the context says nothing was logged and the mock reply stays plain", async () => {
    const { clientId } = await setup("ZZ-TEST Empty");
    const { reply, context, prompt } = await chatTurn(clientId, "How is it going?");
    expect(context.trainingLog).toBe("");
    expect(prompt).toContain("TRAINING LOG: nothing logged in the last 8 weeks.");
    expect(reply).not.toContain("Latest logged");
  });
});
