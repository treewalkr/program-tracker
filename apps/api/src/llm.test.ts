import { afterEach, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, trainers, llmBlobs, llmCalls } from "@pt/db";
import { callLlm, sha256 } from "./ai/llm";
import type { ProviderRuntime } from "./ai/provider";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping llm log tests");
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

const fakeRt: ProviderRuntime = {
  providerId: "fake",
  baseUrl: "http://fake.test/v1",
  model: "fake-model",
  apiKey: "k",
  maxOutputTokens: 1000,
};

const origFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = origFetch;
});

/** Stub the provider with a queue of chat-completion responses. */
function stubProvider(responses: { status?: number; content?: string; body?: unknown }[]) {
  const queue = [...responses];
  globalThis.fetch = (async () => {
    const r = queue.shift();
    if (!r) throw new Error("unexpected provider call");
    const body =
      r.body ??
      {
        choices: [{ message: { content: r.content, reasoning_content: "thinking…" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 64 } },
      };
    return new Response(JSON.stringify(body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

const Answer = z.object({ answer: z.number() });

describe.skipIf(!dbUp)("callLlm logging", () => {
  test("a mock block generation logs one ok call linked to its generation, prompt deduped into blobs", async () => {
    const client = await call("POST", "/v1/clients", { name: "Log Client", email: `log-${Date.now()}@test.dev` });
    const gen = await call("POST", "/v1/ai/generate", { clientId: client.body.id, providerId: "mock" });
    expect(gen.status).toBe(201);

    const rows = await db.select().from(llmCalls).where(eq(llmCalls.generationId, gen.body.id));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.purpose).toBe("block_generate");
    expect(row.status).toBe("ok");
    expect(row.isMock).toBe(true);
    expect(row.attempt).toBe(1);
    expect(row.clientId).toBe(client.body.id);
    expect(row.trainerId).toBe(gen.body.trainerId);
    expect(row.jsonMode).toBe(true);
    expect(row.promptVersion).toMatch(/^buildGenerationMessages:/);
    expect((row.parsed as any).name).toBe(gen.body.draft.name);
    expect(row.requestBlobIds.map((r) => r.role)).toEqual(["system", "user"]);

    // exact prompt text is recoverable from the blobs
    const blobs = await db.select().from(llmBlobs).where(inArray(llmBlobs.sha256, row.requestBlobIds.map((r) => r.sha)));
    expect(blobs).toHaveLength(2);
    for (const b of blobs) expect(sha256(b.content)).toBe(b.sha256);

    // structured inputs: client profile kept, catalog stored once as a blob
    const ctx = row.context as any;
    expect(ctx.client.name).toBe("Log Client");
    expect(ctx.catalog.count).toBeGreaterThan(0);
    const [catalogBlob] = await db.select().from(llmBlobs).where(eq(llmBlobs.sha256, ctx.catalog.blob));
    expect(JSON.parse(catalogBlob.content)).toHaveLength(ctx.catalog.count);
  });

  test("each retry attempt is its own row in one turn; usage, reasoning and latency are kept", async () => {
    stubProvider([{ content: "not json at all" }, { content: '{"answer": 42}' }]);
    const out = await callLlm({
      purpose: "chat_qa",
      builder: "testBuilder",
      links: {},
      messages: [
        { role: "system", content: `system ${Date.now()}` },
        { role: "user", content: "what is the answer" },
      ],
      rt: fakeRt,
      mode: "json",
      schema: Answer,
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data.answer).toBe(42);
    expect(out.attempts).toBe(2);

    const rows = await db.select().from(llmCalls).where(eq(llmCalls.turnId, out.turnId)).orderBy(llmCalls.attempt);
    expect(rows.map((r) => [r.attempt, r.status])).toEqual([
      [1, "parse_error"],
      [2, "ok"],
    ]);
    expect(rows[0].responseRaw).toBe("not json at all");
    expect(rows[0].error).toContain("parse failure");
    expect(rows[1].parsed).toEqual({ answer: 42 });
    expect(rows[1].isMock).toBe(false);
    expect(rows[1].reasoning).toBe("thinking…");
    expect(rows[1].finishReason).toBe("stop");
    expect([rows[1].tokensIn, rows[1].tokensOut, rows[1].tokensCached]).toEqual([100, 20, 64]);
    expect(rows[1].latencyMs).toBeGreaterThanOrEqual(0);
    expect(rows[1].maxTokens).toBe(1000);
    expect(rows[1].temperature).toBeCloseTo(0.7);
    // same prompt on both attempts → same blob refs
    expect(rows[0].requestBlobIds).toEqual(rows[1].requestBlobIds);
  });

  test("no effort picked → the provider's default effort is sent and logged; an explicit pick wins", async () => {
    const sent: unknown[] = [];
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)).reasoning_effort);
      const body = { choices: [{ message: { content: '{"answer": 1}' }, finish_reason: "stop" }] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const rt: ProviderRuntime = { ...fakeRt, providerId: "deepseek", model: "deepseek-flash", defaultEffort: "max" };
    const run = (effort?: string) =>
      callLlm({
        purpose: "chat_qa",
        builder: "testBuilder",
        links: {},
        messages: [{ role: "user", content: `effort ${Date.now()} ${effort}` }],
        rt,
        effort,
        mode: "json",
        schema: Answer,
      });

    const byDefault = await run();
    const picked = await run("low");
    expect(sent).toEqual(["max", "low"]);
    const [row] = await db.select().from(llmCalls).where(eq(llmCalls.turnId, byDefault.turnId));
    expect(row.effort).toBe("max");
    const [pickedRow] = await db.select().from(llmCalls).where(eq(llmCalls.turnId, picked.turnId));
    expect(pickedRow.effort).toBe("low");
  });

  test("schema failures log validation_error with the zod message", async () => {
    stubProvider([{ content: '{"answer": "nope"}' }, { content: '{"answer": "still nope"}' }]);
    const out = await callLlm({
      purpose: "chat_qa",
      builder: "testBuilder",
      links: {},
      messages: [{ role: "user", content: "x" }],
      rt: fakeRt,
      mode: "json",
      schema: Answer,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.kind).toBe("validation");
    const rows = await db.select().from(llmCalls).where(eq(llmCalls.turnId, out.turnId));
    expect(rows.map((r) => r.status)).toEqual(["validation_error", "validation_error"]);
  });

  test("provider errors log provider_error with the HTTP status and stop retrying", async () => {
    stubProvider([{ status: 503, body: { error: { message: "overloaded" } } }]);
    const out = await callLlm({
      purpose: "distill",
      builder: "testBuilder",
      links: {},
      messages: [{ role: "user", content: "x" }],
      rt: fakeRt,
      mode: "text",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.kind).toBe("provider");
    const [row] = await db.select().from(llmCalls).where(eq(llmCalls.turnId, out.turnId));
    expect(row.status).toBe("provider_error");
    expect(row.httpStatus).toBe(503);
    expect(row.error).toContain("overloaded");
    expect(row.jsonMode).toBe(false);
  });

  test("empty content cut off at the token limit explains it as a provider error", async () => {
    stubProvider([{ body: { choices: [{ message: { content: "", reasoning_content: "thinking…" }, finish_reason: "length" }] } }]);
    const out = await callLlm({
      purpose: "chat_qa",
      builder: "testBuilder",
      links: {},
      messages: [{ role: "user", content: "x" }],
      rt: fakeRt,
      mode: "json",
      schema: Answer,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.kind).toBe("provider");
    if (out.kind === "provider") {
      expect(out.error.message).toContain("ran out of tokens");
      expect(out.error.message).toContain("lower effort");
    }
    const [row] = await db.select().from(llmCalls).where(eq(llmCalls.turnId, out.turnId));
    expect(row.finishReason).toBe("length");
  });

  test("JSON cut off at the token limit is not retried", async () => {
    stubProvider([{ body: { choices: [{ message: { content: '{"answer": ' }, finish_reason: "length" }] } }]);
    const out = await callLlm({
      purpose: "chat_qa",
      builder: "testBuilder",
      links: {},
      messages: [{ role: "user", content: "x" }],
      rt: fakeRt,
      mode: "json",
      schema: Answer,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.kind).toBe("validation");
    expect(out.attempts).toBe(1);
    if (out.kind === "validation") expect(out.error).toContain("cut off at the token limit");
    const rows = await db.select().from(llmCalls).where(eq(llmCalls.turnId, out.turnId));
    expect(rows.map((r) => r.status)).toEqual(["parse_error"]);
    expect(rows[0].error).toContain("cut off at the token limit");
  });

  test("a failed log write never fails the call", async () => {
    stubProvider([{ content: "plain answer" }]);
    const errors: unknown[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const out = await callLlm({
        purpose: "chat_qa",
        builder: "testBuilder",
        // unknown trainer → FK violation on insert
        links: { trainerId: crypto.randomUUID() },
        messages: [{ role: "user", content: "x" }],
        rt: fakeRt,
        mode: "text",
      });
      expect(out.ok).toBe(true);
      expect(out.callId).toBeNull();
      if (out.ok) expect(out.data).toBe("plain answer");
    } finally {
      console.error = origError;
    }
    expect(errors.length).toBeGreaterThan(0);
  });

  test("identical messages across calls share one blob", async () => {
    const system = `shared system prompt ${crypto.randomUUID()}`;
    stubProvider([{ content: "a" }, { content: "b" }]);
    for (const q of ["q1", "q2"]) {
      await callLlm({
        purpose: "chat_qa",
        builder: "testBuilder",
        links: {},
        messages: [
          { role: "system", content: system },
          { role: "user", content: q },
        ],
        rt: fakeRt,
        mode: "text",
      });
    }
    const blobs = await db.select().from(llmBlobs).where(eq(llmBlobs.sha256, sha256(system)));
    expect(blobs).toHaveLength(1);
    expect(blobs[0].bytes).toBe(Buffer.byteLength(system));
  });

  test("chat Q&A and proposal turns link the call to the assistant reply row", async () => {
    const client = await call("POST", "/v1/clients", { name: "Chat Log", email: `chatlog-${Date.now()}@test.dev` });
    const qa = await call("POST", "/v1/ai/chat", { clientId: client.body.id, message: "How is the squat going?", providerId: "mock" });
    expect(qa.status).toBe(201);
    const reply = qa.body.messages[1];
    const [qaRow] = await db.select().from(llmCalls).where(eq(llmCalls.chatMessageId, reply.id));
    expect(qaRow.purpose).toBe("chat_qa");
    expect(qaRow.jsonMode).toBe(false);
    expect(qaRow.responseRaw).toBe(reply.content);

    const gen = await call("POST", "/v1/ai/generate", { clientId: client.body.id, providerId: "mock" });
    const turn = await call("POST", "/v1/ai/chat/turn", {
      clientId: client.body.id,
      generationId: gen.body.id,
      message: "swap bench for incline",
      providerId: "mock",
    });
    expect(turn.status).toBe(201);
    const proposalRow = turn.body.messages[1];
    const [turnRow] = await db.select().from(llmCalls).where(eq(llmCalls.chatMessageId, proposalRow.id));
    expect(turnRow.purpose).toBe("proposal_turn");
    expect(turnRow.generationId).toBe(gen.body.id);
    expect((turnRow.parsed as any).proposal).not.toBeNull();
  });

  test("distill logs with its purpose and the mock model", async () => {
    const before = await db.select().from(llmCalls).where(eq(llmCalls.purpose, "distill"));
    const client = await call("POST", "/v1/clients", { name: "Distill Log", email: `distill-${Date.now()}@test.dev` });
    await call("POST", "/v1/ai/generate", { clientId: client.body.id, providerId: "mock", instructions: "keep it short" });
    const res = await call("POST", "/v1/ai/preferences/distill", { clientId: client.body.id, providerId: "mock" });
    expect(res.status).toBeLessThan(300);
    const after = await db.select().from(llmCalls).where(eq(llmCalls.purpose, "distill"));
    expect(after.length).toBe(before.length + 1);
    const row = after.find((r) => !before.some((b) => b.id === r.id))!;
    expect(row.isMock).toBe(true);
    expect(row.model).toBe("mock-distill-v1");
    expect(row.responseRaw).toBe(res.body.document);
  });

  test("distill refuses a malformed client id or provider before any call is logged", async () => {
    const before = await db.select().from(llmCalls).where(eq(llmCalls.purpose, "distill"));
    expect((await call("POST", "/v1/ai/preferences/distill", { clientId: "nope", providerId: "mock" })).status).toBe(422);
    expect((await call("POST", "/v1/ai/preferences/distill", { providerId: 7 })).status).toBe(422);
    const after = await db.select().from(llmCalls).where(eq(llmCalls.purpose, "distill"));
    expect(after.length).toBe(before.length);
  });
});
