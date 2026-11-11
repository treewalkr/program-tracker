import { describe, expect, test } from "bun:test";
import { sameDraft, type AiProgramDraft } from "@pt/shared";
import { mockApi } from "./api";

describe("mock adapter: draft hand edits", () => {
  test(
    "an edit makes the next version and an edit note; undo puts the draft back as another version",
    async () => {
      const clientId = "cl-maya";
      await mockApi.clearChat(clientId);
      const g = await mockApi.generate({ clientId });
      const first = g.draft!.sessions.findIndex((s) => s.kind !== "cardio" && s.exercises.length > 1);
      const target = g.draft!.sessions.findIndex((s, i) => i !== first && s.kind !== "cardio");
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
      expect(undone.message.content).toBe("Edited the draft by hand (v3): undid the last hand edit.");
      expect(sameDraft(undone.generation.draft as AiProgramDraft, g.draft as AiProgramDraft)).toBe(true);
    },
    15000
  );

  test(
    "a proposal made before a hand edit can't be built",
    async () => {
      const g = await mockApi.generate({ clientId: "cl-maya" });
      const turn = await mockApi.chatTurn({ clientId: "cl-maya", generationId: g.id, message: "Cut accessories to 2 sets" });
      const first = g.draft!.sessions.findIndex((s) => s.kind !== "cardio" && s.exercises.length > 1);
      const target = g.draft!.sessions.findIndex((s, i) => i !== first && s.kind !== "cardio");
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
      const day = g.draft!.sessions.findIndex((s) => s.kind !== "cardio" && s.exercises.length > 1) + 1;
      const last = g.draft!.sessions[day - 1].exercises.length;
      // The bottom row moves up, whatever its role.
      const res = await mockApi.editDraft(g.id, [{ op: "move", refs: [{ day, slot: last }], dir: "up" }]);
      expect(res.generation.trainerOrder).toBe(true);
      const order = res.generation.draft!.sessions[day - 1].exercises.map((e) => e.exerciseName);

      const again = await mockApi.editDraft(res.generation.id, [{ op: "move", refs: [{ day, slot: 1 }], dir: "down" }]);
      expect(again.generation.trainerOrder).toBe(true);
      const next = again.generation.draft!.sessions[day - 1].exercises.map((e) => e.exerciseName);
      expect(next.slice(0, 2)).toEqual([order[1], order[0]]);

      const program = await mockApi.approveGeneration(again.generation.id);
      const seq = g.draft!.sessions.slice(0, day).filter((s) => s.kind !== "cardio").length;
      const s = program.weeks[0].sessions.find((x) => x.kind === "lifting" && x.seq === seq)!;
      expect(s.exercises.map((e) => e.exerciseName)).toEqual(next);
    },
    15000
  );
});
