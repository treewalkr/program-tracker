import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

describe("mockApi.chains", () => {
  test("returns the five seeded defaults", async () => {
    const chains = await mockApi.chains();
    expect(chains).toHaveLength(5);
    expect(chains.map((c) => c.name)).toEqual([
      "Intrinsic",
      "Deep Longitudinal",
      "Lateral",
      "Posterior Spiral",
      "Anterior Spiral",
    ]);
    expect(chains.map((c) => c.id)).toEqual([
      "chain-intrinsic",
      "chain-deep-longitudinal",
      "chain-lateral",
      "chain-posterior-spiral",
      "chain-anterior-spiral",
    ]);
    for (const c of chains) {
      expect(c.id.startsWith("chain-")).toBe(true);
      expect(c.muscleGroups.length).toBeGreaterThan(0);
    }
  });
});

describe("mockApi.updateChain", () => {
  test("persists edits and rejects invalid input", async () => {
    const updated = await mockApi.updateChain("chain-lateral", {
      muscleGroups: ["glutes"],
    });
    expect(updated.muscleGroups).toEqual(["glutes"]);

    const chains = await mockApi.chains();
    const lateral = chains.find((c) => c.id === "chain-lateral");
    expect(lateral?.muscleGroups).toEqual(["glutes"]);

    expect(
      mockApi.updateChain("non-existent-id", { muscleGroups: ["back"] })
    ).rejects.toThrow("chain not found");

    expect(
      mockApi.updateChain("chain-lateral", { muscleGroups: [] })
    ).rejects.toThrow("invalid chain");
  });
});
