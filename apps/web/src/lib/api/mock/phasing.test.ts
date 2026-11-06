import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

/** Same document, every object's keys reversed — what jsonb does not preserve, but the api ignores. */
const reorder = (v: any): any =>
  Array.isArray(v)
    ? v.map(reorder)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).reverse().map(([k, val]) => [k, reorder(val)]))
      : v;

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

  test(
    "an unchanged plan is refused regardless of key order",
    async () => {
      const g = await mockApi.generate({ clientId: "cl-maya" });
      const plan = { phase: "accumulation", plannedWeeks: 2, weeks: [{ week: 1, directive: "base" as const }, { week: 2, directive: "deload" as const }] };
      const child = await mockApi.savePhasing(g.id, plan);

      const reordered = reorder(plan);
      expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(plan));
      await expect(mockApi.savePhasing(child.id, reordered)).rejects.toThrow("phasing is unchanged");
    },
    15000
  );
});
