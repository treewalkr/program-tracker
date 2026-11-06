import { describe, expect, test } from "bun:test";
import { draftNoticeText, mockChatReply } from "@pt/shared";
import { mockApi } from "./api";

describe("mock adapter: chat send, revise, and clear", () => {
  test(
    "mock adapter: chat send, revise, and clear",
    async () => {
    const clientId = "cl-maya";

    // Clear any previous chat
    await mockApi.clearChat(clientId);
    expect(await mockApi.chatMessages(clientId)).toEqual([]);

    // Blank message throws
    await expect(mockApi.sendChatMessage({ clientId, message: "   " })).rejects.toThrow(
      "message must not be empty"
    );

    // Send valid message
    const msg = "How has Maya's squat progressed?";
    const sent = await mockApi.sendChatMessage({ clientId, message: msg });
    expect(sent).toHaveLength(2);
    expect(sent[0].role).toBe("trainer");
    expect(sent[0].kind).toBe("chat");
    expect(sent[0].content).toBe(msg);
    expect(sent[1].role).toBe("assistant");
    expect(sent[1].kind).toBe("chat");
    expect(sent[1].content).toBe(mockChatReply(msg, "Maya Chen"));

    const inState = await mockApi.chatMessages(clientId);
    expect(inState).toHaveLength(2);

    // Create a draft generation so we can test smart turns
    const gen = await mockApi.generate({ clientId, instructions: "Draft for test" });
    expect(gen.status).toBe("validated");

    // Blank turn message throws
    await expect(mockApi.chatTurn({ clientId, generationId: gen.id, message: "   " })).rejects.toThrow(
      "message must not be empty"
    );

    // Question turn: reply only, no draft, no version churn
    const qMsg = "Why is the bench volume so low?";
    const qRes = await mockApi.chatTurn({ clientId, generationId: gen.id, message: qMsg });
    expect(qRes.messages).toHaveLength(2);
    expect(qRes.generation).toBeNull();
    expect(qRes.messages[0].kind).toBe("revision");
    expect(qRes.messages[1].kind).toBe("chat");
    expect(qRes.messages[1].content).toBe(mockChatReply(qMsg, "Maya Chen"));

    // Turn without a draft target is plain Q&A
    const noTarget = await mockApi.chatTurn({ clientId, message: "How are we doing?" });
    expect(noTarget.generation).toBeNull();
    expect(noTarget.messages[0].kind).toBe("chat");

    // Change-request turn: a proposal, no version built yet
    const revMsg = "Swap bench for incline dumbbell press";
    const reviseRes = await mockApi.chatTurn({ clientId, generationId: gen.id, message: revMsg });
    expect(reviseRes.messages).toHaveLength(2);
    expect(reviseRes.generation).toBeNull();

    expect(reviseRes.messages[0].role).toBe("trainer");
    expect(reviseRes.messages[0].kind).toBe("revision");
    expect(reviseRes.messages[0].content).toBe(revMsg);
    expect(reviseRes.messages[0].generationId).toBeNull();

    expect(reviseRes.messages[1].role).toBe("assistant");
    expect(reviseRes.messages[1].kind).toBe("proposal");
    expect(reviseRes.messages[1].content).toBe(`Proposed: ${revMsg}`);
    expect(reviseRes.messages[1].generationId).toBeNull();
    expect(reviseRes.messages[1].proposal!.parentGenerationId).toBe(gen.id);
    expect(reviseRes.messages[1].proposal!.builtGenerationId).toBeNull();

    const updatedTranscript = await mockApi.chatMessages(clientId);
    expect(updatedTranscript).toHaveLength(8);

    // Clear chat
    await mockApi.clearChat(clientId);
    const cleared = await mockApi.chatMessages(clientId);
    expect(cleared).toEqual([]);
  },
  15_000
);
});

describe("mock adapter: chatTurn latency and no-publish", () => {
  test(
    "mock chatTurn change request holds ~2.2s then returns a proposal",
    async () => {
      const g = await mockApi.generate({ clientId: "cl-maya" });
      expect(g.status).toBe("validated");
      const gensBefore = await mockApi.generations("cl-maya");

      const start = performance.now();
      const res = await mockApi.chatTurn({ clientId: "cl-maya", generationId: g.id, message: "Cut accessories to 2 sets" });
      const elapsed = performance.now() - start;
      expect(elapsed >= 2_000).toBe(true);

      expect(res.generation).toBeNull();
      expect(res.messages[1].kind).toBe("proposal");
      const gens = await mockApi.generations("cl-maya");
      expect(gens.length).toBe(gensBefore.length);
      expect(gens[0].id).toBe(gensBefore[0].id);
    },
    15_000
  );

  test(
    "mock chatTurn leaves programs untouched; approve still yields a draft program",
    async () => {
      const g = await mockApi.generate({ clientId: "cl-maya" });
      expect(g.status).toBe("validated");

      const before = (await mockApi.client("cl-maya")).programs.map((p) => [p.id, p.status]);
      const res = await mockApi.chatTurn({ clientId: "cl-maya", generationId: g.id, message: "Swap one accessory" });
      const built = await mockApi.buildProposal(res.messages[1].id, {});
      const after = (await mockApi.client("cl-maya")).programs.map((p) => [p.id, p.status]);
      expect(after).toEqual(before);

      const program = await mockApi.approveGeneration(built.generation.id);
      expect(program.status).toBe("draft");
    },
    15_000
  );
});

describe("mock: propose → build", () => {
  test(
    "mock: change request → proposal → build → next version",
    async () => {
      const clientId = "cl-maya";
      const gens = await mockApi.generations(clientId);
      const parent = gens.find((g) => g.status === "validated" && g.draft);
      expect(parent).toBeDefined();

      const turn = await mockApi.chatTurn({
        clientId,
        generationId: parent!.id,
        message: "Add rest to the first exercise",
      });
      expect(turn.generation).toBeNull();
      expect(turn.messages[1].kind).toBe("proposal");

      const built = await mockApi.buildProposal(turn.messages[1].id, {});
      expect(built.generation.parentGenerationId).toBe(parent!.id);
      expect(built.generation.status).toBe("validated");
      expect(built.messages[0].kind).toBe("draft");

      await expect(mockApi.buildProposal(turn.messages[1].id, {})).rejects.toThrow(
        "proposal already built"
      );
    },
    20_000
  );
});
