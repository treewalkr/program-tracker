import { describe, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, trainers, clients, clientMessages, chatMessages, llmBlobs, llmCalls, llmFeedback } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping llm feedback tests");
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

const feedbackFor = (subjectId: string) =>
  db.select().from(llmFeedback).where(eq(llmFeedback.subjectId, subjectId)).orderBy(llmFeedback.createdAt);

async function newClient(name = "Feedback Client") {
  const res = await call("POST", "/v1/clients", { name, email: `fb-${crypto.randomUUID()}@test.dev`, sessionsPerWeek: 2 });
  return res.body.id as string;
}

async function mockDraft(clientId: string) {
  const res = await call("POST", "/v1/ai/generate", { clientId, providerId: "mock" });
  expect(res.status).toBe(201);
  return res.body;
}

describe.skipIf(!dbUp)("implicit LLM feedback", () => {
  test("approving an untouched draft is a +1 on the generating call", async () => {
    const clientId = await newClient();
    const gen = await mockDraft(clientId);
    const approved = await call("POST", `/v1/ai/generations/${gen.id}/approve`);
    expect(approved.status).toBe(201);

    const [fb] = await feedbackFor(gen.id);
    expect(fb.signal).toBe("draft_approved_unedited");
    expect(fb.score).toBe(1);
    expect(fb.subjectKind).toBe("generation");
    const [genCall] = await db.select().from(llmCalls).where(eq(llmCalls.generationId, gen.id));
    expect(fb.callId).toBe(genCall.id);
    expect((fb.payload as any).programId).toBe(approved.body.id);

    // editing the approved program within 14 days records the trainer's correction
    const program = approved.body;
    const weeks = structuredClone(program.weeks);
    weeks[0].sessions[0].exercises = weeks[0].sessions[0].exercises.slice(1);
    const put = await call("PUT", `/v1/programs/${program.id}`, { weeks });
    expect(put.status).toBe(200);
    const all = await feedbackFor(gen.id);
    const edit = all.find((f) => f.signal === "program_edited_after_approval")!;
    expect(edit.score).toBe(0);
    const payload = edit.payload as any;
    expect(payload.fromVersion).toBe(1);
    expect(payload.toVersion).toBe(2);
    expect(payload.weeks[0].rows.some((r: any) => r.change === "removed")).toBe(true);
  });

  test("reject (with reason), revise and regenerate each judge the draft", async () => {
    const clientId = await newClient();
    const first = await mockDraft(clientId);

    const revised = await call("POST", `/v1/ai/generations/${first.id}/revise`, { message: "fewer squats" });
    expect(revised.status).toBe(201);
    const [rev] = await feedbackFor(first.id);
    expect(rev.signal).toBe("draft_revised");
    expect(rev.comment).toBe("fewer squats");
    expect((rev.payload as any).childGenerationId).toBe(revised.body.id);

    const rejected = await call("POST", `/v1/ai/generations/${revised.body.id}/reject`, { reason: "ignored the knee" });
    expect(rejected.status).toBe(200);
    const [rej] = await feedbackFor(revised.body.id);
    expect(rej.signal).toBe("draft_rejected");
    expect(rej.score).toBe(-1);
    expect(rej.comment).toBe("ignored the knee");

    // first is still validated and was never approved → regenerating marks it
    const second = await mockDraft(clientId);
    const regen = (await feedbackFor(first.id)).find((f) => f.signal === "draft_regenerated")!;
    expect(regen.score).toBe(-1);
    expect((regen.payload as any).newGenerationId).toBe(second.id);
  });

  test("proposals: built is +1, moving on without building is ignored −1", async () => {
    const clientId = await newClient();
    const gen = await mockDraft(clientId);
    const turn = async (message: string) => {
      const res = await call("POST", "/v1/ai/chat/turn", { clientId, generationId: gen.id, message, providerId: "mock" });
      expect(res.status).toBe(201);
      return res.body.messages[1];
    };
    const ignored = await turn("swap bench for incline press");
    const built = await turn("add face pulls");

    const [ign] = await feedbackFor(ignored.id);
    expect(ign.signal).toBe("proposal_ignored");
    expect(ign.score).toBe(-1);
    expect(ign.callId).not.toBeNull();

    const build = await call("POST", `/v1/ai/chat/proposals/${built.id}/build`, { providerId: "mock" });
    expect(build.status).toBe(201);
    const [b] = await feedbackFor(built.id);
    expect(b.signal).toBe("proposal_built");
    expect(b.score).toBe(1);
    expect((b.payload as any).builtGenerationId).toBe(build.body.generation.id);
  });

  test("client messages: edited approve keeps both texts; reject is −1", async () => {
    const clientId = await newClient();
    const [trainer] = await db.select().from(trainers).limit(1);
    const insert = async () =>
      (
        await db
          .insert(clientMessages)
          .values({
            trainerId: trainer.id,
            clientId,
            week: 1,
            providerId: "mock",
            model: "mock-draft-v1",
            status: "validated",
            draft: { message: "Great week!" },
          })
          .returning()
      )[0];

    const a = await insert();
    await call("POST", `/v1/client-messages/${a.id}/approve`, { text: "Great week, Sam!" });
    const [approved] = await feedbackFor(a.id);
    expect(approved.signal).toBe("client_message_approved");
    expect(approved.score).toBe(0);
    expect(approved.payload).toEqual({ edited: true, draft: "Great week!", final: "Great week, Sam!" });

    const b = await insert();
    await call("POST", `/v1/client-messages/${b.id}/approve`, {});
    expect((await feedbackFor(b.id))[0].score).toBe(1);

    const c = await insert();
    await call("POST", `/v1/client-messages/${c.id}/reject`);
    expect((await feedbackFor(c.id))[0].signal).toBe("client_message_rejected");
  });

  test("clear chat hides messages but keeps them, with a chat_cleared marker", async () => {
    const clientId = await newClient();
    const qa = await call("POST", "/v1/ai/chat", { clientId, message: "How did week 1 go?", providerId: "mock" });
    expect(qa.status).toBe(201);
    const del = await call("DELETE", `/v1/ai/chat?clientId=${clientId}`);
    expect(del.status).toBe(204);

    const visible = await call("GET", `/v1/ai/chat?clientId=${clientId}`);
    expect(visible.body.messages).toEqual([]);
    const kept = await db.select().from(chatMessages).where(eq(chatMessages.clientId, clientId));
    expect(kept).toHaveLength(2);
    expect(kept.every((m) => m.hiddenAt !== null)).toBe(true);

    const marker = await db
      .select()
      .from(llmFeedback)
      .where(and(eq(llmFeedback.clientId, clientId), eq(llmFeedback.signal, "chat_cleared")));
    expect(marker).toHaveLength(1);
    expect(marker[0].score).toBeNull();
    expect((marker[0].payload as any).hiddenCount).toBe(2);

    // hidden history no longer reaches the model
    const next = await call("POST", "/v1/ai/chat", { clientId, message: "Fresh start?", providerId: "mock" });
    const [row] = await db.select().from(llmCalls).where(eq(llmCalls.chatMessageId, next.body.messages[1].id));
    expect((row.context as any).historyMessageIds).toEqual([]);
  });

  test("deleting a client keeps its LLM log but nulls the link and scrubs the name", async () => {
    const name = `Zelda Quokka ${crypto.randomUUID().slice(0, 6)}`;
    const clientId = await newClient(name);
    const gen = await mockDraft(clientId);
    await call("POST", `/v1/ai/generations/${gen.id}/reject`, { reason: `${name} hates lunges` });
    const [before] = await db.select().from(llmCalls).where(eq(llmCalls.generationId, gen.id));
    const shas = before.requestBlobIds.map((r) => r.sha);
    const blobsBefore = await db.select().from(llmBlobs).where(inArray(llmBlobs.sha256, shas));
    expect(blobsBefore.some((b) => b.content.includes(name))).toBe(true);

    await db.delete(clients).where(eq(clients.id, clientId));

    const [after] = await db.select().from(llmCalls).where(eq(llmCalls.id, before.id));
    expect(after.clientId).toBeNull();
    expect(after.generationId).toBeNull(); // generation cascaded away with the client
    expect(JSON.stringify(after.context)).not.toContain(name);
    expect(JSON.stringify(after.context)).toContain("[client]");
    const blobsAfter = await db.select().from(llmBlobs).where(inArray(llmBlobs.sha256, shas));
    expect(blobsAfter.some((b) => b.content.includes(name))).toBe(false);
    const [fb] = await db.select().from(llmFeedback).where(eq(llmFeedback.subjectId, gen.id));
    expect(fb.clientId).toBeNull();
    expect(fb.comment).toBe("[client] hates lunges");
  });
});
