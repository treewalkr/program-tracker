import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { db, trainers, llmCalls, llmExamples, llmPairs } from "@pt/db";
import { datasetStats, exportRecords, makePseudonymizer, pruneUnlabeled } from "./lib/llm-dataset";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping llm dataset tests");
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

async function setup(name: string) {
  const email = `${crypto.randomUUID().slice(0, 8)}@dataset.test`;
  const client = await call("POST", "/v1/clients", { name, email, goals: `${name.split(" ")[0]} wants a 100kg squat` });
  const gen = await call("POST", "/v1/ai/generate", { clientId: client.body.id, providerId: "mock" });
  const [genCall] = await db.select().from(llmCalls).where(eq(llmCalls.generationId, gen.body.id));
  return { clientId: client.body.id as string, email, gen: gen.body, genCall };
}

describe("makePseudonymizer", () => {
  test("full and first names become a stable alias; emails vanish", () => {
    const anon = makePseudonymizer([{ id: "c1", name: "Maya Chen" }]);
    const out = anon.text("Maya Chen (maya@x.dev): Maya's squat. Mayan ruins.");
    expect(out).not.toContain("Maya Chen");
    expect(out).toMatch(/^Client-[0-9a-f]{6} \(\[email\]\): Client-[0-9a-f]{6}'s squat\. Mayan ruins\.$/);
    expect(anon.deep({ client: { name: "Maya Chen", email: "maya@x.dev" } })).toEqual({
      client: { name: anon.text("Maya Chen") },
    });
  });
});

describe.skipIf(!dbUp)("llm datasets", () => {
  test("sft: an unedited approval is a gold example with the exact prompt, pseudonymized", async () => {
    const name = `Odalys Brightwater`;
    const { gen, genCall, email } = await setup(name);
    await call("POST", `/v1/ai/generations/${gen.id}/approve`);

    const [ex] = await db.select().from(llmExamples).where(eq(llmExamples.callId, genCall.id));
    expect(ex.label).toBe("gold");

    const records = (await exportRecords("sft", { includeMock: true, purposes: ["block_generate"] })) as any[];
    const mine = records.find((r) => r.messages.at(-1).content === genCall.responseRaw);
    expect(mine).toBeDefined();
    expect(mine.messages.map((m: any) => m.role)).toEqual(["system", "user", "assistant"]);
    const json = JSON.stringify(records);
    expect(json).not.toContain(name);
    expect(json).not.toContain("Odalys");
    expect(json).not.toContain(email);
    expect(JSON.stringify(mine)).toContain("Client-");

    // mock calls stay out unless asked for
    const real = (await exportRecords("sft", { purposes: ["block_generate"] })) as any[];
    expect(real.find((r) => r.messages.at(-1).content === genCall.responseRaw)).toBeUndefined();
  });

  test("sft: an edit after approval makes a silver example whose target is the trainer's week", async () => {
    const { gen, genCall } = await setup("Silver Case");
    const approved = await call("POST", `/v1/ai/generations/${gen.id}/approve`);
    const weeks = structuredClone(approved.body.weeks);
    const dropped = weeks[0].sessions[0].exercises.length;
    weeks[0].sessions[0].exercises = weeks[0].sessions[0].exercises.slice(1);
    await call("PUT", `/v1/programs/${approved.body.id}`, { weeks });

    const [ex] = await db.select().from(llmExamples).where(eq(llmExamples.callId, genCall.id));
    expect(ex.label).toBe("silver");
    const records = (await exportRecords("sft", { includeMock: true, purposes: ["block_generate"] })) as any[];
    const target = records
      .map((r) => JSON.parse(r.messages.at(-1).content))
      .find((d) => d.sessions?.[0]?.exercises?.length === dropped - 1 && d.name === gen.draft.name);
    expect(target).toBeDefined();
    expect(target.rationale).toBe(gen.draft.rationale);

    const gold = (await exportRecords("sft", { includeMock: true, purposes: ["block_generate"], minLabel: "gold" })) as any[];
    expect(gold.some((r) => r.messages.at(-1).content === JSON.stringify(target))).toBe(false);
  });

  test("dpo: the approved revision is preferred over the draft it revised", async () => {
    const { gen, genCall } = await setup("Pair Case");
    const child = await call("POST", `/v1/ai/generations/${gen.id}/revise`, { message: "less volume" });
    await call("POST", `/v1/ai/generations/${child.body.id}/approve`);
    const [childCall] = await db.select().from(llmCalls).where(eq(llmCalls.generationId, child.body.id));
    const [row] = await db.select().from(llmPairs).where(eq(llmPairs.preferredCallId, childCall.id));
    expect(row).toMatchObject({ kind: "revision", nonPreferredCallId: genCall.id, critique: "less volume" });

    // mock revisions render no prompt (and are skipped); give this one the parent's for the shape check
    expect(childCall.requestBlobIds).toEqual([]);
    await db.update(llmCalls).set({ requestBlobIds: genCall.requestBlobIds }).where(eq(llmCalls.id, childCall.id));
    const records = (await exportRecords("dpo", { includeMock: true })) as any[];
    const pair = records.find((r) => r.preferred_output[0].content === childCall.responseRaw);
    expect(pair).toBeDefined();
    expect(pair.non_preferred_output[0].content).toBe(genCall.responseRaw);
    expect(pair.metadata).toEqual({ kind: "revision", critique: "less volume", purpose: "revision" });
  });

  test("eval and fewshot: negatives carry the rejected output; fewshot keeps only accepted ones", async () => {
    const { gen, genCall } = await setup("Eval Case");
    await call("POST", `/v1/ai/generations/${gen.id}/reject`, { reason: "too much volume" });

    const evals = (await exportRecords("eval", { includeMock: true })) as any[];
    const neg = evals.find((r) => r.call_id === genCall.id);
    expect(neg.label).toBe("negative");
    expect(neg.expected).toBeNull();
    expect(neg.rejected).toBe(genCall.responseRaw);
    expect(neg.comments).toEqual(["too much volume"]);
    expect(neg.prompt_version).toMatch(/^buildGenerationMessages:/);
    expect(neg.context.client.name).toMatch(/^Client-/);

    const few = (await exportRecords("fewshot", { includeMock: true })) as any[];
    expect(few.every((r) => r.label === "gold" || r.label === "silver")).toBe(true);
    expect(Object.keys(few[0]).sort()).toEqual(["accepted_output", "label", "purpose", "situation", "why"]);
  });

  test("prune blanks old unlabeled ok calls only", async () => {
    const unlabeled = await setup("Prune Unlabeled");
    const labeled = await setup("Prune Labeled");
    await call("POST", `/v1/ai/generations/${labeled.gen.id}/reject`, {});
    const old = sql`now() - interval '200 days'`;
    for (const id of [unlabeled.genCall.id, labeled.genCall.id]) {
      await db.update(llmCalls).set({ createdAt: old }).where(eq(llmCalls.id, id));
    }

    expect(await pruneUnlabeled({ dryRun: true })).toBeGreaterThanOrEqual(1);
    await pruneUnlabeled();
    const [u] = await db.select().from(llmCalls).where(eq(llmCalls.id, unlabeled.genCall.id));
    const [l] = await db.select().from(llmCalls).where(eq(llmCalls.id, labeled.genCall.id));
    expect(u.responseRaw).toBeNull();
    expect(u.prunedAt).not.toBeNull();
    expect(u.parsed).not.toBeNull(); // structured output stays
    expect(l.responseRaw).not.toBeNull();
    expect(l.prunedAt).toBeNull();
  });

  test("stats count real calls by purpose and label; admin route serves them", async () => {
    const stats = await datasetStats();
    expect(stats.mockCalls).toBeGreaterThan(0);
    expect(stats.feedback.implicit).toBeGreaterThan(0);
    for (const row of stats.byPurpose) expect(Object.keys(row).sort()).toEqual(["gold", "negative", "purpose", "silver", "unlabeled"]);

    const res = await call("GET", "/v1/admin/llm-stats");
    expect(res.status).toBe(200);
    expect(res.body.mockCalls).toBe(stats.mockCalls);
  });
});
