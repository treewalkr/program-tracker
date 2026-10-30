import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

/** Maya's seeded program (pg-maya-a) has logged weeks 1–5; week 5 is the latest. */
describe("mockApi client messages", () => {
  test("generate → approve(text) → finalText; reject flips status; list newest-first", async () => {
    const gen = await mockApi.generateClientMessage({
      clientId: "cl-maya",
      programId: "pg-maya-a",
      week: 5,
    });
    expect(gen.status).toBe("validated");
    expect(gen.draft).not.toBeNull();
    expect(gen.draft!.message.length).toBeGreaterThan(0);
    expect(gen.draft!.message.length).toBeLessThanOrEqual(1200);
    expect(gen.stats).not.toBeNull();
    expect(gen.stats!.week).toBe(5);
    expect(gen.week).toBe(5);
    expect(gen.finalText).toBeNull();

    const approved = await mockApi.approveClientMessage(gen.id, `  Nice work this week!  `);
    expect(approved.status).toBe("approved");
    expect(approved.finalText).toBe("Nice work this week!");

    // approve-as-is on a second draft: finalText === draft.message
    const second = await mockApi.generateClientMessage({
      clientId: "cl-maya",
      programId: "pg-maya-a",
      week: 5,
    });
    const asIs = await mockApi.approveClientMessage(second.id);
    expect(asIs.finalText).toBe(second.draft!.message);

    const rejected = await mockApi.rejectClientMessage(second.id);
    // reject mirrors the API: no status guard, flips to rejected
    expect(rejected.status).toBe("rejected");

    const list = await mockApi.clientMessages("cl-maya");
    expect(list.length).toBe(2);
    expect(new Date(list[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(list[1].createdAt).getTime()
    );

    const one = await mockApi.clientMessage(gen.id);
    expect(one.id).toBe(gen.id);
    expect(one.status).toBe("approved");
  });

  test("mirrors the API guard contract", async () => {
    expect(
      mockApi.generateClientMessage({
        clientId: "cl-maya",
        programId: "pg-maya-a",
        week: 6,
      })
    ).rejects.toThrow("week 6 has no logged sessions");

    expect(
      mockApi.generateClientMessage({
        clientId: "cl-maya",
        programId: "missing",
        week: 5,
      })
    ).rejects.toThrow("program not found");

    expect(
      mockApi.generateClientMessage({
        clientId: "missing",
        programId: "pg-maya-a",
        week: 5,
      })
    ).rejects.toThrow("client not found");
  });
});
