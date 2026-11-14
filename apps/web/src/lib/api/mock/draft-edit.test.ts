import { describe, expect, test } from "bun:test";
import { sameDraft, type AiProgramDraft } from "@pt/shared";
import { mockApi } from "./api";

describe("mock adapter: draft hand edits", () => {
  test(
    "an edit makes the next version and an edit note; undo folds back into it as 'changes undone'",
    async () => {
      const clientId = "cl-maya";
      await mockApi.clearChat(clientId);
      const g = await mockApi.generate({ clientId });
      const first = g.draft!.weeks[0].sessions.findIndex((s) => s.kind !== "cardio" && s.exercises.length > 1);
      const target = g.draft!.weeks[0].sessions.findIndex((s, i) => i !== first && s.kind !== "cardio");
      expect(first).toBeGreaterThanOrEqual(0);
      expect(target).toBeGreaterThanOrEqual(0);

      const res = await mockApi.editDraft(g.id, [{ op: "moveTo", refs: [{ day: first + 1, slot: 1 }], day: target + 1 }]);
      expect(res.generation.parentGenerationId).toBe(g.id);
      expect(res.generation.manualEdit).toBe(true);
      expect(res.generation.revisionMessage).toStartWith("Edited by you: moved ");
      expect(res.message.kind).toBe("edit");
      expect(res.message.content).toStartWith("Edited the draft by hand (v2): moved ");
      expect((await mockApi.chatMessages(clientId)).at(-1)?.id).toBe(res.message.id);

      await expect(mockApi.editDraft(g.id, res.undo)).rejects.toThrow("only the latest version can be edited");

      const undone = await mockApi.editDraft(res.generation.id, res.undo);
      expect(undone.folded).toBe(true);
      expect(undone.generation.id).toBe(res.generation.id);
      expect(undone.message.id).toBe(res.message.id);
      expect(undone.message.content).toBe("Edited the draft by hand (v2): changes undone, the draft is back to v1.");
      expect(undone.generation.revisionMessage).toBe("Edited by you: changes undone");
      expect(sameDraft(undone.generation.draft as AiProgramDraft, g.draft as AiProgramDraft)).toBe(true);
    },
    15000
  );

  test(
    "a proposal made before a hand edit can't be built",
    async () => {
      const g = await mockApi.generate({ clientId: "cl-maya" });
      const turn = await mockApi.chatTurn({ clientId: "cl-maya", generationId: g.id, message: "Cut accessories to 2 sets" });
      const first = g.draft!.weeks[0].sessions.findIndex((s) => s.kind !== "cardio" && s.exercises.length > 1);
      const target = g.draft!.weeks[0].sessions.findIndex((s, i) => i !== first && s.kind !== "cardio");
      await mockApi.editDraft(g.id, [{ op: "moveTo", refs: [{ day: first + 1, slot: 1 }], day: target + 1 }]);
      await expect(mockApi.buildProposal(turn.messages[1].id, {})).rejects.toThrow("edited by hand");
    },
    15000
  );

  test(
    "a hand-edited draft keeps its order: across roles, through a revision, and on approve",
    async () => {
      const g = await mockApi.generate({ clientId: "cl-maya" });
      expect(g.trainerOrder ?? false).toBe(false);
      const day = g.draft!.weeks[0].sessions.findIndex((s) => s.kind !== "cardio" && s.exercises.length > 1) + 1;
      const last = g.draft!.weeks[0].sessions[day - 1].exercises.length;
      // The bottom row moves up, whatever its role.
      const res = await mockApi.editDraft(g.id, [{ op: "move", refs: [{ day, slot: last }], dir: "up" }]);
      expect(res.generation.trainerOrder).toBe(true);
      const order = res.generation.draft!.weeks[0].sessions[day - 1].exercises.map((e) => e.exerciseName);

      const again = await mockApi.editDraft(res.generation.id, [{ op: "move", refs: [{ day, slot: 1 }], dir: "down" }]);
      expect(again.generation.trainerOrder).toBe(true);
      const next = again.generation.draft!.weeks[0].sessions[day - 1].exercises.map((e) => e.exerciseName);
      expect(next.slice(0, 2)).toEqual([order[1], order[0]]);

      const program = await mockApi.approveGeneration(again.generation.id);
      const seq = g.draft!.weeks[0].sessions.slice(0, day).filter((s) => s.kind !== "cardio").length;
      const s = program.weeks[0].sessions.find((x) => x.kind === "lifting" && x.seq === seq)!;
      expect(s.exercises.map((e) => e.exerciseName)).toEqual(next);
    },
    15000
  );

  test(
    "consecutive edits fold; a chat line in between adds a continued note; a revision starts a new version",
    async () => {
      const clientId = "cl-maya";
      await mockApi.clearChat(clientId);
      const g = await mockApi.generate({ clientId });
      const day = g.draft!.weeks[0].sessions.findIndex((s) => s.kind !== "cardio" && s.exercises.length > 2) + 1;
      expect(day).toBeGreaterThan(0);
      const up = (slot: number) => [{ op: "move" as const, refs: [{ day, slot }], dir: "up" as const }];

      const a = await mockApi.editDraft(g.id, up(2));
      expect(a.folded).toBe(false);
      expect(a.version).toBe(2);
      const b = await mockApi.editDraft(a.generation.id, up(3));
      expect(b.folded).toBe(true);
      expect(b.version).toBe(2);
      expect(b.generation.id).toBe(a.generation.id);
      expect(b.message.id).toBe(a.message.id);
      expect(b.generation.revisionMessage).toBe(`Edited by you: ${a.changes[0]}; ${b.changes[0]}`);
      expect(b.message.content).toBe(`Edited the draft by hand (v2): ${a.changes[0]}; ${b.changes[0]}.`);

      await mockApi.sendChatMessage({ clientId, message: "Is this order fine?" });
      const c = await mockApi.editDraft(a.generation.id, up(2));
      expect(c.folded).toBe(true);
      expect(c.message.id).not.toBe(a.message.id);
      expect(c.message.content).toBe(`Edited the draft by hand (v2, continued): ${c.changes[0]}.`);
      const thread = await mockApi.chatMessages(clientId);
      expect(thread.filter((m) => m.kind === "edit")).toHaveLength(2);
      expect(thread.at(-1)?.content).toBe(c.message.content);

      const rev = await mockApi.reviseGeneration(a.generation.id, "Keep it");
      const d = await mockApi.editDraft(rev.id, up(2));
      expect(d.folded).toBe(false);
      expect(d.version).toBe(4);
    },
    15000
  );

  test(
    "an open proposal on the hand-edit version stops the fold",
    async () => {
      const g = await mockApi.generate({ clientId: "cl-maya" });
      const day = g.draft!.weeks[0].sessions.findIndex((s) => s.kind !== "cardio" && s.exercises.length > 2) + 1;
      const a = await mockApi.editDraft(g.id, [{ op: "move", refs: [{ day, slot: 2 }], dir: "up" }]);
      await mockApi.chatTurn({ clientId: "cl-maya", generationId: a.generation.id, message: "Cut accessories to 2 sets" });
      const b = await mockApi.editDraft(a.generation.id, [{ op: "move", refs: [{ day, slot: 3 }], dir: "up" }]);
      expect(b.folded).toBe(false);
      expect(b.generation.parentGenerationId).toBe(a.generation.id);
    },
    15000
  );
});
