import { describe, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, aiGenerations, chatMessages, llmBlobs, llmCalls, trainers } from "@pt/db";
import { DRAFT_EDIT_NOTE_PREFIX } from "@pt/shared";
import { loadRevisionConversation } from "./lib/revision";
import { HAND_EDIT_RULE } from "./ai/prompt";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping draft edit tests");
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

/** The prompt text a logged LLM call sent (all messages joined). */
async function promptOf(chatMessageId: string): Promise<string> {
  const [row] = await db.select().from(llmCalls).where(eq(llmCalls.chatMessageId, chatMessageId));
  const blobs = await db
    .select()
    .from(llmBlobs)
    .where(inArray(llmBlobs.sha256, row.requestBlobIds.map((b) => b.sha)));
  return blobs.map((b) => b.content).join("\n");
}

describe.skipIf(!dbUp)("draft hand edits (no AI)", () => {
  let clientId = "";
  let genId = "";
  let editedId = "";
  let undo: unknown[] = [];
  let note = "";

  test("setup: client and a validated block draft", async () => {
    const c = await call("POST", "/v1/clients", { name: "Hand Edit Client", email: `edit-${crypto.randomUUID()}@test.dev`, sessionsPerWeek: 2 });
    expect(c.status).toBe(201);
    clientId = c.body.id;
    const g = await call("POST", "/v1/ai/generate", { clientId, providerId: "mock" });
    expect(g.status).toBe(201);
    genId = g.body.id;
    expect(g.body.draft.sessions[0].exercises.length).toBeGreaterThan(1);
  });

  test("an edit saves the next version, replayed on the server, with an edit note in the chat", async () => {
    const parent = (await call("GET", `/v1/ai/generations/${genId}`)).body;
    const moved = parent.draft.sessions[0].exercises[1];
    const res = await call("POST", `/v1/ai/generations/${genId}/edit`, {
      ops: [{ op: "moveTo", refs: [{ day: 1, slot: 2 }], day: 2 }],
    });
    expect(res.status).toBe(201);
    const { generation, message } = res.body;
    editedId = generation.id;
    undo = res.body.undo;
    note = message.content;

    expect(generation.parentGenerationId).toBe(genId);
    expect(generation.status).toBe("validated");
    expect(generation.manualEdit).toBe(true);
    expect(generation.revisionMessage).toStartWith("Edited by you: moved ");
    expect(generation.draft.sessions[0].exercises).toHaveLength(parent.draft.sessions[0].exercises.length - 1);
    expect(generation.draft.sessions[1].exercises).toContainEqual(moved);

    expect(message.kind).toBe("edit");
    expect(message.role).toBe("trainer");
    expect(message.generationId).toBe(generation.id);
    expect(note).toBe(`${DRAFT_EDIT_NOTE_PREFIX} (v2): ${generation.revisionMessage.slice("Edited by you: ".length)}.`);
    expect(note).toContain("to Session 2");
  });

  test("only the latest version is editable", async () => {
    const res = await call("POST", `/v1/ai/generations/${genId}/edit`, {
      ops: [{ op: "superset", ref: { day: 1, slot: 1 }, with: "below" }],
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("only the latest version can be edited");
  });

  test("bad ops and no-op edits are refused", async () => {
    const bad = await call("POST", `/v1/ai/generations/${editedId}/edit`, { ops: [{ op: "rename" }] });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toBe("invalid edit");

    const stale = await call("POST", `/v1/ai/generations/${editedId}/edit`, {
      ops: [{ op: "leave", ref: { day: 1, slot: 9 } }],
    });
    expect(stale.status).toBe(422);
    expect(stale.body.error).toBe("no exercise at session 1, slot 9");

    const noop = await call("POST", `/v1/ai/generations/${editedId}/edit`, {
      ops: [{ op: "move", refs: [{ day: 1, slot: 1 }], dir: "up" }],
    });
    expect(noop.status).toBe(422);
    expect(noop.body.error).toBe("the draft is unchanged");

    const missing = await call("POST", `/v1/ai/generations/00000000-0000-0000-0000-000000000000/edit`, { ops: undo });
    expect(missing.status).toBe(404);
  });

  test("the edit note reaches the proposal/build conversation and the system prompt rule", async () => {
    const conversation = await loadRevisionConversation(editedId);
    expect(conversation).toContain(`Trainer: ${note}`);

    // A proposal turn on the edited version: the model gets the note in its conversation.
    const turn = await call("POST", "/v1/ai/chat/turn", { clientId, generationId: editedId, message: "Swap the curls for hammer curls", providerId: "mock" });
    expect(turn.status).toBe(201);
    const [row] = await db.select().from(llmCalls).where(eq(llmCalls.chatMessageId, turn.body.messages[1].id));
    expect((row.context as { conversation: string }).conversation).toContain(note);
    expect((row.context as { parentGenerationId: string }).parentGenerationId).toBe(editedId);
  });

  test("the edit note reaches the chat Q&A prompt, with the rule", async () => {
    const res = await call("POST", "/v1/ai/chat", { clientId, message: "Why is this order better?", providerId: "mock" });
    expect(res.status).toBe(201);
    const prompt = await promptOf(res.body.messages[1].id);
    expect(prompt).toContain(note);
    expect(prompt).toContain(HAND_EDIT_RULE);
  });

  test("a proposal made before a hand edit can't be built over it", async () => {
    const c = await call("POST", "/v1/clients", { name: "Stale Proposal Client", email: `stale-${crypto.randomUUID()}@test.dev`, sessionsPerWeek: 2 });
    const g = await call("POST", "/v1/ai/generate", { clientId: c.body.id, providerId: "mock" });
    const turn = await call("POST", "/v1/ai/chat/turn", { clientId: c.body.id, generationId: g.body.id, message: "Add a core finisher", providerId: "mock" });
    expect(turn.status).toBe(201);
    const edit = await call("POST", `/v1/ai/generations/${g.body.id}/edit`, {
      ops: [{ op: "moveTo", refs: [{ day: 1, slot: 2 }], day: 2 }],
    });
    expect(edit.status).toBe(201);
    const built = await call("POST", `/v1/ai/chat/proposals/${turn.body.messages[1].id}/build`, { providerId: "mock" });
    expect(built.status).toBe(409);
  });

  test("undo restores the previous draft as another new version", async () => {
    const res = await call("POST", `/v1/ai/generations/${editedId}/edit`, { ops: undo });
    expect(res.status).toBe(201);
    const original = (await call("GET", `/v1/ai/generations/${genId}`)).body;
    expect(res.body.generation.parentGenerationId).toBe(editedId);
    expect(res.body.generation.draft.sessions).toEqual(original.draft.sessions);
    expect(res.body.message.content).toBe(`${DRAFT_EDIT_NOTE_PREFIX} (v3): undid the last hand edit.`);

    const edits = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.clientId, clientId), eq(chatMessages.kind, "edit")));
    expect(edits).toHaveLength(2);
  });

  test("week drafts and drafts that are not validated are refused", async () => {
    const [gen] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, genId));
    const [pending] = await db
      .insert(aiGenerations)
      .values({ trainerId: gen.trainerId, clientId, kind: "block", providerId: "mock", model: "mock-draft-v1", status: "pending" })
      .returning();
    const res = await call("POST", `/v1/ai/generations/${pending.id}/edit`, { ops: undo });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("generation is pending, not validated");

    const [week] = await db
      .insert(aiGenerations)
      .values({ trainerId: gen.trainerId, clientId, kind: "week", targetWeek: 2, providerId: "mock", model: "mock-draft-v1", status: "validated", draft: gen.draft })
      .returning();
    const w = await call("POST", `/v1/ai/generations/${week.id}/edit`, { ops: undo });
    expect(w.status).toBe(409);
  });
});
