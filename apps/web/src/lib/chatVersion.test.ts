import { describe, expect, test } from "bun:test";
import { changeSummary, fmtElapsed, renderMarkdown, stripDraftNotice, versionRows, versionView } from "./chatRefine";
import type { AiDraftDto, GenerationDto } from "./api/types";

const set = (reps: number, restSeconds: number) => ({ setNumber: 1, type: "working" as const, reps, amrap: false, restSeconds });

function gen(id: string, parent: string | null, sessions: AiDraftDto["sessions"]): GenerationDto {
  return {
    id,
    clientId: "c1",
    basedOnProgramId: null,
    kind: "block",
    targetWeek: null,
    providerId: "mock",
    model: "mock",
    status: "validated",
    draft: { name: "B", rationale: "", clientSummary: "", weeks: [{ week: 1, sessions }] },
    error: null,
    parentGenerationId: parent,
    revisionMessage: null,
    instructions: null,
    rejectReason: null,
    approvedProgramId: null,
    exampleProgramIds: [],
    createdAt: new Date().toISOString(),
  };
}

const catalog = new Map<string, { movementPattern: string | null }>();

describe("versionView", () => {
  // v1: [Plank (core), Squat (primary)] — role sort shows Squat first, but slots keep draft order.
  const v1 = gen("g1", null, [
    { name: "Day 1", exercises: [
      { exerciseName: "Plank", role: "core", prescribedSets: [set(1, 45)] },
      { exerciseName: "Squat", role: "primary", prescribedSets: [set(5, 120)] },
    ] },
  ]);
  const v2 = gen("g2", "g1", [
    { name: "Day 1", exercises: [
      { exerciseName: "Plank", role: "core", prescribedSets: [set(1, 45)] },
      { exerciseName: "Squat", role: "primary", prescribedSets: [set(5, 150)] },
    ] },
  ]);
  const gens = [v2, v1];

  test("shows the requested version with raw-draft slot numbers", () => {
    const v = versionView(gens, "g2", 2, catalog)!;
    expect(v.version).toBe(2);
    expect(v.sessions[0].exercises.map((e) => [e.name, e.slot])).toEqual([["Squat", 2], ["Plank", 1]]);
  });

  test("changes are against the previous version", () => {
    const v = versionView(gens, "g2", 2, catalog)!;
    expect(v.changes).toEqual([
      { day: 1, beforeSlot: 2, afterSlot: 2, kind: "rx", exercise: "Squat", from: "rest 120s", to: "rest 150s" },
    ]);
    expect(versionView(gens, "g2", 1, catalog)!.changes).toEqual([]);
  });

  test("returns null past the end of the chain", () => {
    expect(versionView(gens, "g2", 3, catalog)).toBeNull();
  });
});

describe("chat text helpers", () => {
  test("changeSummary counts by kind", () => {
    expect(
      changeSummary([
        { day: 1, beforeSlot: 1, afterSlot: 1, kind: "swap", exercise: "B", from: "A", to: "B" },
        { day: 1, beforeSlot: 2, afterSlot: 2, kind: "rx", exercise: "C", from: "rest 60s", to: "rest 90s" },
        { day: 1, beforeSlot: 3, afterSlot: 3, kind: "rx", exercise: "D", from: "rest 60s", to: "rest 90s" },
      ])
    ).toBe("1 exercise swapped or renamed · 2 prescription edits");
  });

  test("renderMarkdown escapes HTML and renders bold, paragraphs and lists", () => {
    expect(renderMarkdown("Hi <b>x</b> **bold**\n\n- one\n- two")).toBe(
      "<p>Hi &lt;b&gt;x&lt;/b&gt; <strong>bold</strong></p><ul><li>one</li><li>two</li></ul>"
    );
  });

  test("fmtElapsed and stripDraftNotice", () => {
    expect(fmtElapsed(62_500)).toBe("1:02");
    expect(stripDraftNotice("Done.\n\nDraft ready: B — 3 sessions. Open review to inspect and approve.")).toBe("Done.");
  });
});

describe("versionRows", () => {
  test("first draft, AI change summary, and the hand edit's own label", () => {
    const v1 = gen("a", null, [{ name: "A", exercises: [{ exerciseName: "Squat", prescribedSets: [set(5, 120)] }] }]);
    const v2 = { ...gen("b", "a", [{ name: "A", exercises: [{ exerciseName: "Squat", prescribedSets: [set(3, 120)] }] }]), revisionMessage: "Heavier squats" };
    const v3 = { ...gen("c", "b", v2.draft!.weeks[0].sessions), manualEdit: true, revisionMessage: "Edited by you: moved Squat up in Session 1" };
    const v4 = { ...gen("d", "c", v2.draft!.weeks[0].sessions), revisionMessage: "Keep it" };
    expect(versionRows([v1, v2, v3, v4])).toEqual([
      { version: 1, by: "ai", label: "First draft" },
      { version: 2, by: "ai", label: "1 prescription edit" },
      { version: 3, by: "you", label: "moved Squat up in Session 1" },
      { version: 4, by: "ai", label: "Keep it" },
    ]);
  });
});
