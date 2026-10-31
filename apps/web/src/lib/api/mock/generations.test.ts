import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

describe("mockApi generation and cancellation", () => {
  test("mock generate goes pending-first and can be cancelled during delay", async () => {
    const promise = mockApi.generate({
      clientId: "cl-maya",
      instructions: "test cancel",
    });

    const gens = await mockApi.generations("cl-maya");
    const pending = gens.find((g) => g.status === "pending");
    expect(pending).toBeDefined();
    expect(pending?.draft).toBeNull();

    const cancelled = await mockApi.cancelGeneration(pending!.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.draft).toBeNull();

    const result = await promise;
    expect(result.status).toBe("cancelled");
    expect(result.draft).toBeNull();

    const refreshed = await mockApi.generation(pending!.id);
    expect(refreshed.status).toBe("cancelled");
    expect(refreshed.draft).toBeNull();
  });

  test("mock cancelGeneration guards: 404 for unknown, 409 for non-pending", async () => {
    await expect(mockApi.cancelGeneration("non-existent")).rejects.toThrow("generation not found");

    const validated = (await mockApi.generations("cl-maya")).find((g) => g.status === "validated");
    if (validated) {
      await expect(mockApi.cancelGeneration(validated.id)).rejects.toThrow("generation is validated, not pending");
    }
  });
});
