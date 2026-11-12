import { describe, expect, test } from "bun:test";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, trainers, coachingRules, llmBlobs, llmCalls, llmFeedback } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { app } from "./app";
import { gatherPreferenceSignals } from "./lib/preferences";
import { exportRecords } from "./lib/llm-dataset";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select().from(trainers).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping coaching rule tests");
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

async function newClient(name = "Rules Client") {
  const res = await call("POST", "/v1/clients", { name, email: `cr-${crypto.randomUUID()}@test.dev`, sessionsPerWeek: 2 });
  return res.body.id as string;
}

async function mockDraft(clientId: string) {
  const res = await call("POST", "/v1/ai/generate", { clientId, providerId: "mock" });
  expect(res.status).toBe(201);
  return res.body;
}

/** The full prompt text and context of the call that drafted `generationId`. */
async function promptOf(generationId: string) {
  const [c] = await db.select().from(llmCalls).where(eq(llmCalls.generationId, generationId)).orderBy(desc(llmCalls.createdAt)).limit(1);
  const blobs = await db.select().from(llmBlobs).where(inArray(llmBlobs.sha256, c.requestBlobIds.map((r) => r.sha)));
  const bySha = new Map(blobs.map((b) => [b.sha256, b.content]));
  return { text: c.requestBlobIds.map((r) => bySha.get(r.sha) ?? "").join("\n"), context: c.context as Record<string, any> };
}

const ruleRow = async (id: string) => (await db.select().from(coachingRules).where(eq(coachingRules.id, id)))[0];

const slotAnchor = (gen: any, exerciseIndex = 0) => ({
  type: "slot" as const,
  session: gen.draft.sessions[0].name,
  sessionIndex: 0,
  exerciseIndex,
  exerciseName: gen.draft.sessions[0].exercises[exerciseIndex].exerciseName,
});

async function note(gen: any, extra: Record<string, unknown> = {}) {
  return call("POST", "/v1/ai/feedback/notes", {
    subjectKind: "generation",
    subjectId: gen.id,
    anchor: slotAnchor(gen),
    comment: "Too heavy after a deload week",
    correction: "Belt squat 3×8 @ RPE 7",
    ...extra,
  });
}

describe.skipIf(!dbUp)("detailed notes", () => {
  test("a once-scoped note is recorded with anchor + correction and proposes nothing", async () => {
    const clientId = await newClient();
    const gen = await mockDraft(clientId);
    const res = await note(gen);
    expect(res.status).toBe(201);
    expect(res.body.rule).toBeNull();
    expect(res.body.note.scope).toBe("once");
    expect(res.body.note.anchorText).toContain("Back Squat");

    const [row] = await db.select().from(llmFeedback).where(eq(llmFeedback.id, res.body.note.id));
    expect(row.signal).toBe("note");
    expect(row.score).toBe(0);
    expect(row.correction).toBe("Belt squat 3×8 @ RPE 7");
    expect((row.anchor as any).exerciseIndex).toBe(0);
    expect(row.callId).not.toBeNull();
    expect(row.clientId).toBe(clientId);
    const rules = await db.select().from(coachingRules).where(eq(coachingRules.clientId, clientId));
    expect(rules).toHaveLength(0);

    const listed = await call("GET", `/v1/ai/feedback/notes?subjectIds=${gen.id}`);
    expect(listed.body.notes.map((n: any) => n.id)).toEqual([row.id]);
    // notes are not thumbs verdicts
    const verdicts = await call("GET", `/v1/ai/feedback?subjectIds=${gen.id}`);
    expect(verdicts.body.verdicts).toHaveLength(0);
  });

  test("a note needs words", async () => {
    const gen = await mockDraft(await newClient());
    const res = await note(gen, { comment: "  ", correction: undefined });
    expect(res.status).toBe(422);
  });

  test("scope client extracts a proposed rule via rule_extract; it stays out of prompts until confirmed", async () => {
    const clientId = await newClient();
    const gen = await mockDraft(clientId);
    const res = await note(gen, { scope: "client" });
    expect(res.status).toBe(201);
    const rule = res.body.rule;
    expect(rule.status).toBe("proposed");
    expect(rule.clientId).toBe(clientId);
    expect(rule.text).toContain("Belt squat 3×8 @ RPE 7");

    const row = await ruleRow(rule.id);
    expect(row.source).toBe("note");
    expect(row.sourceFeedbackIds).toEqual([res.body.note.id]);
    const [extract] = await db
      .select()
      .from(llmCalls)
      .where(and(eq(llmCalls.purpose, "rule_extract"), eq(llmCalls.clientId, clientId)));
    expect(extract.status).toBe("ok");
    expect(extract.isMock).toBe(true);
    expect((extract.parsed as any).rule).toBe(rule.text);

    // proposed → not in the next prompt
    const before = await promptOf((await mockDraft(clientId)).id);
    expect(before.text).not.toContain("COACHING RULES");
    expect(before.context.ruleIds).toEqual([]);

    // confirm → in the next prompt, applied once, source note linked
    const confirmed = await call("POST", `/v1/ai/rules/${rule.id}/confirm`, { scope: "client" });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe("active");
    const after = await promptOf((await mockDraft(clientId)).id);
    expect(after.text).toContain("COACHING RULES (confirmed by the trainer");
    expect(after.text).toContain(`- [this client] ${rule.text}`);
    expect(after.context.ruleIds).toEqual([rule.id]);
    expect((await ruleRow(rule.id)).appliedCount).toBe(1);
    const [linked] = await db.select().from(llmFeedback).where(eq(llmFeedback.id, res.body.note.id));
    expect(linked.ruleId).toBe(rule.id);

    // confirming twice is refused
    expect((await call("POST", `/v1/ai/rules/${rule.id}/confirm`, { scope: "client" })).status).toBe(409);

    // retired → out of prompts, count unchanged
    const retired = await call("PATCH", `/v1/ai/rules/${rule.id}`, { status: "retired" });
    expect(retired.body.status).toBe("retired");
    const gone = await promptOf((await mockDraft(clientId)).id);
    expect(gone.text).not.toContain(rule.text);
    expect((await ruleRow(rule.id)).appliedCount).toBe(1);
  });

  test("client rules stay with their client; all-client rules reach everyone, client rules first", async () => {
    const a = await newClient("Client A");
    const b = await newClient("Client B");
    const forA = await call("POST", "/v1/ai/rules", { text: "Never program box jumps for this client", clientId: a, category: "ignored_limitation" });
    expect(forA.status).toBe(201);
    expect(forA.body.status).toBe("active");
    const general = await call("POST", "/v1/ai/rules", { text: "Cap accessories at 3 sets" });

    const promptA = await promptOf((await mockDraft(a)).id);
    const promptB = await promptOf((await mockDraft(b)).id);
    expect(promptA.text).toContain("[this client] Never program box jumps");
    expect(promptA.text).toContain("- Cap accessories at 3 sets");
    expect(promptA.text.indexOf("box jumps")).toBeLessThan(promptA.text.indexOf("Cap accessories"));
    expect(promptB.text).not.toContain("box jumps");
    expect(promptB.text).toContain("Cap accessories at 3 sets");
    expect(promptB.context.ruleIds).toContain(general.body.id);
    expect(promptB.context.ruleIds).not.toContain(forA.body.id);

    // switch scope: the client rule becomes general
    const widened = await call("PATCH", `/v1/ai/rules/${forA.body.id}`, { clientId: null });
    expect(widened.body.clientId).toBeNull();
    expect((await promptOf((await mockDraft(b)).id)).text).toContain("Never program box jumps");
  });

  test("dismissed rules never reach a prompt; delete removes them", async () => {
    const clientId = await newClient();
    const gen = await mockDraft(clientId);
    const res = await note(gen, { scope: "always", correction: "Goblet squat 3×10" });
    expect(res.body.rule.clientId).toBeNull();
    const dismissed = await call("POST", `/v1/ai/rules/${res.body.rule.id}/dismiss`);
    expect(dismissed.body.status).toBe("retired");
    expect((await promptOf((await mockDraft(clientId)).id)).text).not.toContain("Goblet squat 3×10");
    expect((await call("DELETE", `/v1/ai/rules/${res.body.rule.id}`)).status).toBe(204);
    expect(await ruleRow(res.body.rule.id)).toBeUndefined();
  });

  test("👎 with what-instead and scope proposes a rule; the broken-rule picker counts a violation", async () => {
    const clientId = await newClient();
    const gen = await mockDraft(clientId);
    const rule = await call("POST", "/v1/ai/rules", { text: "No barbell squats for this client", clientId });
    const res = await call("POST", "/v1/ai/feedback", {
      subjectKind: "generation",
      subjectId: gen.id,
      signal: "thumbs_down",
      reasonTags: ["ignored_limitation"],
      comment: "Knee pain",
      correction: "Leg press instead",
      scope: "client",
      violatedRuleId: rule.body.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.signal).toBe("thumbs_down");
    expect(res.body.correction).toBe("Leg press instead");
    expect(res.body.rule.status).toBe("proposed");
    expect(res.body.rule.category).toBe("ignored_limitation");
    const v = await ruleRow(rule.body.id);
    expect(v.violatedCount).toBe(1);
    const [row] = await db.select().from(llmFeedback).where(eq(llmFeedback.id, res.body.id));
    expect(row.ruleId).toBe(rule.body.id);

    // a proposed or foreign rule can't be named as broken
    const bad = await note(gen, { violatedRuleId: res.body.rule.id });
    expect(bad.status).toBe(404);
  });

  test("apply to this draft runs the note as a revision of the noted version", async () => {
    const clientId = await newClient();
    const gen = await mockDraft(clientId);
    const n = await note(gen);
    const applied = await call("POST", `/v1/ai/feedback/notes/${n.body.note.id}/apply`);
    expect(applied.status).toBe(201);
    expect(applied.body.parentGenerationId).toBe(gen.id);
    expect(applied.body.status).toBe("validated");
    expect(applied.body.revisionMessage).toContain("exercise #1 Back Squat");
    expect(applied.body.revisionMessage).toContain("Do this instead: Belt squat 3×8 @ RPE 7");
    // a note on someone else's / missing id reads as 404
    expect((await call("POST", `/v1/ai/feedback/notes/${crypto.randomUUID()}/apply`)).status).toBe(404);
  });

  test("remember this: a chat-built revision proposes a chat rule", async () => {
    const clientId = await newClient();
    const gen = await mockDraft(clientId);
    const turn = await call("POST", "/v1/ai/chat/turn", { clientId, generationId: gen.id, message: "swap bench for incline press", providerId: "mock" });
    const proposal = turn.body.messages[1];
    const build = await call("POST", `/v1/ai/chat/proposals/${proposal.id}/build`, { providerId: "mock" });
    expect(build.status).toBe(201);
    const res = await call("POST", "/v1/ai/rules/extract", { generationId: build.body.generation.id });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("proposed");
    expect(res.body.clientId).toBe(clientId);
    const row = await ruleRow(res.body.id);
    expect(row.source).toBe("chat");
    expect(row.sourceFeedbackIds).toHaveLength(1);
    // a first draft has no revision to learn from
    expect((await call("POST", "/v1/ai/rules/extract", { generationId: gen.id })).status).toBe(422);
  });

  test("hand-written rules: short, long, unknown category or proposed status are refused", async () => {
    const post = (body: Record<string, unknown>) => call("POST", "/v1/ai/rules", body);
    expect((await post({ text: "no" })).status).toBe(422);
    expect((await post({ text: "x".repeat(401) })).status).toBe(422);
    expect((await post({ text: "Keep it short", category: "vibes" })).status).toBe(422);
    expect((await post({ text: "Keep it short", clientId: "nope" })).status).toBe(422);
    const made = await post({ text: "Keep sets under ten reps" });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ category: "style", status: "active" });
    const id = made.body.id;
    expect((await call("PATCH", `/v1/ai/rules/${id}`, { status: "proposed" })).status).toBe(422);
    expect((await call("PATCH", `/v1/ai/rules/${id}`, { text: "x".repeat(401) })).status).toBe(422);
    expect((await call("POST", `/v1/ai/rules/${id}/confirm`, { scope: "sometimes" })).status).toBe(422);
    // a PATCH without category leaves it alone
    expect((await call("PATCH", `/v1/ai/rules/${id}`, { text: "Keep sets under eight reps" })).body.category).toBe("style");
    expect((await call("DELETE", `/v1/ai/rules/${id}`)).status).toBe(204);
  });

  test("rules list carries client names and source notes", async () => {
    const clientId = await newClient("Listed Client");
    const gen = await mockDraft(clientId);
    const n = await note(gen, { scope: "client" });
    const list = await call("GET", "/v1/ai/rules");
    const found = list.body.rules.find((r: any) => r.id === n.body.rule.id);
    expect(found.clientName).toBe("Listed Client");
    expect(found.sources[0].correction).toBe("Belt squat 3×8 @ RPE 7");
    expect(found.sources[0].anchorText).toContain("Back Squat");
  });

  test("notes feed the distill signals and the eval/fewshot exports", async () => {
    const clientId = await newClient("Signal Client");
    const gen = await mockDraft(clientId);
    const n = await note(gen);
    const signals = await gatherPreferenceSignals(gen.trainerId, clientId);
    const noteSignal = signals.find((s) => s.kind === "note");
    expect(noteSignal?.text).toContain("Too heavy after a deload week");
    expect(noteSignal?.text).toContain("→ instead: Belt squat 3×8 @ RPE 7");

    const [noteRow] = await db.select().from(llmFeedback).where(eq(llmFeedback.id, n.body.note.id));
    const evalRows = (await exportRecords("eval", { includeMock: true })) as any[];
    const ev = evalRows.find((r) => r.call_id === noteRow.callId);
    expect(ev.notes[0].anchor.type).toBe("slot");
    expect(ev.notes[0].correction).toBe("Belt squat 3×8 @ RPE 7");

    // approved unedited → gold → in the few-shot export, notes attached
    expect((await call("POST", `/v1/ai/generations/${gen.id}/approve`)).status).toBe(201);
    const shots = (await exportRecords("fewshot", { includeMock: true })) as any[];
    const shot = shots.find((r) => r.notes?.some((x: any) => x.correction === "Belt squat 3×8 @ RPE 7"));
    expect(shot.notes[0].on).toContain("Back Squat");
  });
});

describe("prompt builders", () => {
  test("every builder with LEARNED PREFERENCES also renders COACHING RULES", async () => {
    const { buildGenerationMessages, buildRevisionMessages, buildWeekMessages, buildWeekRevisionMessages, buildChatSystem } =
      await import("./ai/prompt");
    const { MOCK_DRAFT } = await import("./ai/mock");
    const base = {
      client: { name: "Ann", goals: "strength", limitations: null, sessionsPerWeek: 2, trainingDays: null, cardioTarget: null },
      previousProgram: null,
      periodization: null,
      chainBalance: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
      learnedPreferences: "- prefer dumbbells",
      coachingRules: [
        { id: "r1", text: "No box jumps", scope: "client" as const },
        { id: "r2", text: "Cap accessories at 3 sets", scope: "always" as const },
      ],
    };
    const week = { targetWeek: 2, plannedWeeks: 4, targetDirective: null, target: null };
    const texts = [
      Object.values(buildGenerationMessages(base)).join("\n"),
      Object.values(buildRevisionMessages({ ...base, previousDraft: MOCK_DRAFT, feedback: "less volume" })).join("\n"),
      Object.values(buildRevisionMessages({ ...base, previousDraft: MOCK_DRAFT, feedback: "x", outputContract: "proposal" })).join("\n"),
      Object.values(buildWeekMessages({ ...base, ...week })).join("\n"),
      Object.values(buildWeekRevisionMessages({ ...base, ...week, previousDraft: MOCK_DRAFT, feedback: "x" })).join("\n"),
      buildChatSystem({ ...base, latestDraft: null }),
    ];
    for (const text of texts) {
      expect(text).toContain("LEARNED PREFERENCES");
      expect(text).toContain("COACHING RULES (confirmed by the trainer — follow strictly; client rules override general ones):\n- [this client] No box jumps\n- Cap accessories at 3 sets");
    }
    // no rules → no block
    expect(buildChatSystem({ ...base, coachingRules: [], latestDraft: null })).not.toContain("COACHING RULES");
  });
});
