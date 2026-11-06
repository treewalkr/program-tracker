import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

describe("mock adapter: block plan edit", () => {
  test(
    "savePhasing creates the next version with only the plan changed",
    async () => {
      const g = await mockApi.generate({ clientId: "cl-maya" });
      const plan = g.draft?.phasing ?? { phase: "accumulation", plannedWeeks: 2, weeks: [{ week: 1, directive: "base" as const }, { week: 2, directive: "deload" as const }] };
      const edited = structuredClone(plan);
      edited.nextPhase = "peak";

      const child = await mockApi.savePhasing(g.id, edited);
      expect(child.parentGenerationId).toBe(g.id);
      expect(child.manualEdit).toBe(true);
      expect(child.revisionMessage).toBe("Block plan edited by you");
      expect(child.draft?.phasing?.nextPhase).toBe("peak");
      expect(child.draft?.sessions).toEqual(g.draft?.sessions);

      await expect(mockApi.savePhasing(child.id, edited)).rejects.toThrow("phasing is unchanged");
    },
    15000
  );
});
