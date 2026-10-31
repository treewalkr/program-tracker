import { describe, expect, test } from "bun:test";
import { cloneProgramWeeks } from "@pt/shared";
import { mockApi } from "./api";

describe("mockApi examples", () => {
  test("createExample derives daysPerWeek and rejects duplicates", async () => {
    const marked = await mockApi.createExample({
      programId: "pg-maya-0",
      goal: "onboarding technique",
      level: "beginner",
    });
    // days derived from the program's week-1 day count (2 templates)
    expect(marked.daysPerWeek).toBe(2);
    expect(marked.program.id).toBe("pg-maya-0");

    await expect(
      mockApi.createExample({ programId: "pg-maya-0", goal: "again", level: "advanced" })
    ).rejects.toThrow("program is already marked as an example");

    await expect(
      mockApi.createExample({ programId: "pg-missing", goal: "x", level: "beginner" })
    ).rejects.toThrow("program not found");

    // programId filter sees only this program's row
    const forProgram = await mockApi.examples("pg-maya-0");
    expect(forProgram.map((e) => e.id)).toContain(marked.id);

    await mockApi.deleteExample(marked.id);
    // re-create succeeds after removal
    const again = await mockApi.createExample({
      programId: "pg-maya-0",
      goal: "onboarding technique",
      level: "beginner",
    });
    await mockApi.deleteExample(again.id);
  });

  test("updateExample patches tags, clears note on null, 404s unknown", async () => {
    const seeded = (await mockApi.examples("pg-jonas-a"))[0];
    expect(seeded.goal).toBe("lean bulk hypertrophy");

    const patched = await mockApi.updateExample(seeded.id, {
      goal: "lean mass gain",
      daysPerWeek: 5,
      note: null,
    });
    expect(patched.goal).toBe("lean mass gain");
    expect(patched.daysPerWeek).toBe(5);
    expect(patched.note).toBe(null);

    await expect(mockApi.updateExample("ex-nope", { goal: "x" })).rejects.toThrow(
      "example not found"
    );
    await expect(mockApi.deleteExample("ex-nope")).rejects.toThrow("example not found");

    // restore the seed tags
    await mockApi.updateExample(seeded.id, {
      goal: "lean bulk hypertrophy",
      daysPerWeek: 4,
      note: "Jonas's lean-bulk block — the 8–12 rep split to reuse.",
    });
  });

  test("reuse persists createdFromProgramId through createProgram", async () => {
    const example = (await mockApi.examples("pg-jonas-a"))[0];
    const created = await mockApi.createProgram({
      clientId: "cl-maya",
      name: example.program.name,
      description: null,
      weeks: cloneProgramWeeks(example.program.weeks),
      phasing: example.program.phasing ?? null,
      createdFromProgramId: example.programId,
    });
    expect(created.createdFromProgramId).toBe("pg-jonas-a");
    expect(created.status).toBe("draft");
    // cloned weeks carry fresh ids, not the example's
    expect(created.weeks[0].days[0].id).not.toBe(example.program.weeks[0].days[0].id);

    const listed = await mockApi.programs("cl-maya");
    const fromList = listed.find((p) => p.id === created.id);
    expect(fromList?.createdFromProgramId).toBe("pg-jonas-a");

    // back-compat: omitting the field still yields null
    const plain = await mockApi.createProgram({
      clientId: "cl-maya",
      name: "Scratch block",
      description: null,
      weeks: cloneProgramWeeks(example.program.weeks),
      phasing: null,
    });
    expect(plain.createdFromProgramId).toBe(null);
  });

  test("generate stamps exampleProgramIds by shared retrieval", async () => {
    // Jonas's goals ("Lean bulk to 80 kg…") share lean/bulk with the seed tag; 3 days vs 4 → still positive
    const gen = await mockApi.generate({ clientId: "cl-jonas", providerId: "mock" });
    expect(gen.exampleProgramIds).toEqual(["pg-jonas-a"]);
  });

  test("generate with no matching example stamps an empty list", async () => {
    // Priya: no shared words and 2 days vs 4 → zero score, nothing injected
    const cold = await mockApi.generate({ clientId: "cl-priya", providerId: "mock" });
    expect(cold.exampleProgramIds).toEqual([]);
  });
});
