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

    // Create a draft generation so we can test reviseViaChat
    const gen = await mockApi.generate({ clientId, instructions: "Draft for test" });
    expect(gen.status).toBe("validated");

    // Blank revise message throws
    await expect(mockApi.reviseViaChat({ generationId: gen.id, message: "   " })).rejects.toThrow(
      "message must not be empty"
    );

    // Valid revision
    const revMsg = "Swap bench for incline dumbbell press";
    const reviseRes = await mockApi.reviseViaChat({ generationId: gen.id, message: revMsg });
    expect(reviseRes.messages).toHaveLength(2);
    expect(reviseRes.generation.parentGenerationId).toBe(gen.id);
    expect(reviseRes.generation.status).toBe("validated");
    expect(reviseRes.generation.revisionMessage).toBe(revMsg);

    expect(reviseRes.messages[0].role).toBe("trainer");
    expect(reviseRes.messages[0].kind).toBe("revision");
    expect(reviseRes.messages[0].content).toBe(revMsg);
    expect(reviseRes.messages[0].generationId).toBe(reviseRes.generation.id);

    expect(reviseRes.messages[1].role).toBe("assistant");
    expect(reviseRes.messages[1].kind).toBe("draft");
    expect(reviseRes.messages[1].content).toBe(draftNoticeText(reviseRes.generation.draft as any));
    expect(reviseRes.messages[1].generationId).toBe(reviseRes.generation.id);

    const updatedTranscript = await mockApi.chatMessages(clientId);
    expect(updatedTranscript).toHaveLength(4);

    // Clear chat
    await mockApi.clearChat(clientId);
    const cleared = await mockApi.chatMessages(clientId);
    expect(cleared).toEqual([]);
  },
  15_000
);
});
