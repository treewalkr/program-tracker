import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

async function draft(clientId = "cl-maya") {
  const gen = await mockApi.generate({ clientId });
  expect(gen.status).toBe("validated");
  return gen;
}

const anchorOf = (gen: Awaited<ReturnType<typeof draft>>) => ({
  type: "slot" as const,
  session: gen.draft!.weeks[0].sessions[0].name,
  sessionIndex: 0,
  exerciseIndex: 0,
  exerciseName: gen.draft!.weeks[0].sessions[0].exercises[0].exerciseName ?? null,
});

describe("mock adapter: notes and coaching rules", () => {
  test("a once note is stored with its anchor and learns nothing", async () => {
    const gen = await draft();
    const res = await mockApi.addNote({
      subjectKind: "generation",
      subjectId: gen.id,
      anchor: anchorOf(gen),
      comment: "  too heavy  ",
      correction: "Belt squat 3×8",
    });
    expect(res.rule).toBeNull();
    expect(res.note.comment).toBe("too heavy");
    expect(res.note.scope).toBe("once");
    expect(res.note.anchorText).toContain("Session 1");
    const listed = await mockApi.llmNotes([gen.id]);
    expect(listed.map((n) => n.id)).toEqual([res.note.id]);
    await expect(
      mockApi.addNote({ subjectKind: "generation", subjectId: gen.id, anchor: anchorOf(gen), comment: " " })
    ).rejects.toThrow("write a note");
  }, 15_000);

  test("client scope proposes a client rule; confirm, retire, dismiss and delete move it along", async () => {
    const gen = await draft();
    const res = await mockApi.addNote({
      subjectKind: "generation",
      subjectId: gen.id,
      anchor: anchorOf(gen),
      comment: "knee pain",
      correction: "Leg press 3×10",
      scope: "client",
    });
    expect(res.rule?.status).toBe("proposed");
    expect(res.rule?.clientId).toBe("cl-maya");
    expect(res.rule?.text).toContain("Leg press 3×10");

    const listed = (await mockApi.coachingRules()).find((r) => r.id === res.rule!.id)!;
    expect(listed.sources?.[0].correction).toBe("Leg press 3×10");
    expect(listed.clientName).toBeTruthy();

    const active = await mockApi.confirmCoachingRule(res.rule!.id, { scope: "always", text: "Leg press, never back squat" });
    expect(active.status).toBe("active");
    expect(active.clientId).toBeNull();
    expect(active.text).toBe("Leg press, never back squat");
    await expect(mockApi.confirmCoachingRule(active.id, { scope: "client" })).rejects.toThrow("not proposed");
    expect((await mockApi.llmNotes([gen.id])).find((n) => n.id === res.note.id)?.ruleId).toBe(active.id);

    // naming it as broken counts a violation
    await mockApi.addNote({ subjectKind: "generation", subjectId: gen.id, anchor: anchorOf(gen), comment: "again", violatedRuleId: active.id });
    expect((await mockApi.coachingRules()).find((r) => r.id === active.id)?.violatedCount).toBe(1);

    const retired = await mockApi.updateCoachingRule(active.id, { status: "retired" });
    expect(retired.status).toBe("retired");
    await mockApi.deleteCoachingRule(active.id);
    expect((await mockApi.coachingRules()).some((r) => r.id === active.id)).toBe(false);

    const other = await mockApi.rateLlmOutput({
      subjectKind: "generation",
      subjectId: gen.id,
      signal: "thumbs_down",
      reasonTags: ["load_off"],
      comment: "too heavy",
      correction: "RPE 7 max",
      scope: "always",
    });
    expect(other.correction).toBe("RPE 7 max");
    expect(other.rule?.category).toBe("load_off");
    expect(other.rule?.clientId).toBeNull();
    const dismissed = await mockApi.dismissCoachingRule(other.rule!.id);
    expect(dismissed.status).toBe("retired");
  }, 15_000);

  test("manual rules are active at once; apply-to-draft and chat extract revise and propose", async () => {
    const manual = await mockApi.createCoachingRule({ text: "Cap accessories at 3 sets" });
    expect(manual.status).toBe("active");
    expect(manual.source).toBe("manual");

    const gen = await draft();
    const { note } = await mockApi.addNote({
      subjectKind: "generation",
      subjectId: gen.id,
      anchor: anchorOf(gen),
      comment: "swap it",
      correction: "Goblet squat",
    });
    const child = await mockApi.applyNote(note.id);
    expect(child.parentGenerationId).toBe(gen.id);
    expect(child.status).toBe("validated");
    expect(child.revisionMessage).toContain("Do this instead: Goblet squat");

    const rule = await mockApi.extractChatRule({ generationId: child.id });
    expect(rule.status).toBe("proposed");
    expect(rule.source).toBe("chat");
    await expect(mockApi.extractChatRule({ generationId: gen.id })).rejects.toThrow("revised draft");
  }, 15_000);
});
