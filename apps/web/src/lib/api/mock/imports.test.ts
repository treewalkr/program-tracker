import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mockApi } from "./api";

const FIXTURE = readFileSync(new URL("../../../../../../packages/shared/fixtures/import/week11-12.txt", import.meta.url), "utf8");

describe("mockApi imports (mirrors /v1/ai/imports with the mock provider)", () => {
  test("reads the sample into a stored, reopenable, checked result", async () => {
    const row = await mockApi.createImport({ clientId: "cl-maya", text: FIXTURE });
    expect(row).toMatchObject({ status: "done", chunksTotal: 2, chunksDone: 2 });
    expect(row.result!.weeks.map((w) => w.label)).toEqual(["Week 11", "Week 12"]);
    expect(row.result!.defaultBlock).toBe(1);
    expect((await mockApi.importRow(row.id)).result).toEqual(row.result);
    expect((await mockApi.imports("cl-maya"))[0]).toMatchObject({ id: row.id, preview: expect.stringMatching(/^Week 11/) });
    await expect(mockApi.cancelImport(row.id)).rejects.toThrow("not pending");
  }, 10_000);

  test("new words skip the glossary; a term added applies from the next read", async () => {
    const first = await mockApi.createImport({ clientId: "cl-maya", text: FIXTURE });
    expect(first.result!.newTerms!.map((t) => t.term)).toEqual(["Supinate", "Asymmetrical"]);
    const added = await mockApi.createGlossaryTerm({ term: "Supinate", meaning: "palms-up grip", kind: "technique" });
    const second = await mockApi.createImport({ clientId: "cl-maya", text: FIXTURE });
    expect(second.result!.newTerms!.map((t) => t.term)).toEqual(["Asymmetrical"]);
    await mockApi.deleteGlossaryTerm(added.id);
  }, 15_000);

  test("other text reads as unused lines; blank text is refused", async () => {
    const row = await mockApi.createImport({ clientId: "cl-maya", text: "Squat 5x5\nBench 3x8" });
    expect(row.result!.unused).toEqual([1, 2]);
    await expect(mockApi.createImport({ clientId: "cl-maya", text: "\n———\n" })).rejects.toThrow("nothing to read");
  }, 10_000);
});
