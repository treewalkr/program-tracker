import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";
import { exercises } from "./data";

const byName = (name: string) => exercises.find((e) => e.name === name)!.id;

describe("mockApi aliases (mirrors /v1/vocabulary/aliases)", () => {
  test("seeded global aliases are listed and read-only", async () => {
    const list = await mockApi.aliases();
    const bss = list.find((a) => a.alias === "bss")!;
    expect(bss).toMatchObject({ exerciseName: "Bulgarian Split Squat", scope: "global", source: "seed" });
    await expect(mockApi.patchAlias(bss.id, byName("Back Squat"))).rejects.toThrow("read-only");
    await expect(mockApi.deleteAlias(bss.id)).rejects.toThrow("read-only");
  });

  test("save, re-point and delete a personal alias; personal ones list first", async () => {
    await mockApi.saveAliases([{ alias: "  ZZ Goblet! ", exerciseId: byName("Back Squat"), source: "manual" }]);
    const list = await mockApi.aliases();
    expect(list[0].scope).toBe("personal");
    const mine = list.find((a) => a.alias === "zz goblet")!;
    expect(mine).toMatchObject({ exerciseName: "Back Squat", scope: "personal" });

    const moved = await mockApi.patchAlias(mine.id, byName("Split Squat"));
    expect(moved).toMatchObject({ id: mine.id, exerciseName: "Split Squat", source: "manual" });
    await expect(mockApi.patchAlias(mine.id, "nope")).rejects.toThrow("exercise not found");

    await mockApi.deleteAlias(mine.id);
    expect((await mockApi.aliases()).some((a) => a.id === mine.id)).toBe(false);
  });

  test("a personal alias with a global one's words overrides it in matching", async () => {
    await mockApi.saveAliases([{ alias: "bss", exerciseId: byName("Split Squat"), source: "manual" }]);
    const both = (await mockApi.aliases()).filter((a) => a.alias === "bss");
    expect(both.map((a) => a.scope)).toEqual(["personal", "global"]);
    await mockApi.deleteAlias(both[0].id);
  });
});

describe("mockApi glossary (mirrors /v1/vocabulary/glossary)", () => {
  test("starts with the global seed", async () => {
    const list = await mockApi.glossary();
    expect(list.find((g) => g.term === "AMRAP")).toMatchObject({ kind: "technique", scope: "global" });
    expect(list.every((g) => g.scope === "global")).toBe(true);
  });

  test("add, override, edit, delete; duplicates and global writes refused", async () => {
    const global = (await mockApi.glossary()).find((g) => g.term === "SA")!;
    await expect(mockApi.patchGlossaryTerm(global.id, { meaning: "x" })).rejects.toThrow("read-only");
    await expect(mockApi.deleteGlossaryTerm(global.id)).rejects.toThrow("read-only");

    const mine = await mockApi.createGlossaryTerm({ term: " SA ", meaning: " standing  alternating ", kind: "abbreviation" });
    expect(mine).toMatchObject({ term: "SA", meaning: "standing alternating", scope: "personal" });
    const list = await mockApi.glossary();
    expect(list.filter((g) => g.term === "SA")).toEqual([mine]);
    await expect(mockApi.createGlossaryTerm({ term: "sa", meaning: "x", kind: "other" })).rejects.toThrow("already in your glossary");

    const edited = await mockApi.patchGlossaryTerm(mine.id, { meaning: "single arm, alternating", kind: "technique" });
    expect(edited).toMatchObject({ meaning: "single arm, alternating", kind: "technique" });
    await mockApi.deleteGlossaryTerm(mine.id);
    expect((await mockApi.glossary()).find((g) => g.term === "SA")!.scope).toBe("global");
  });
});
