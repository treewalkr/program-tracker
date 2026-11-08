import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

describe("mockApi role labels (mirrors /v1/vocabulary/role-labels)", () => {
  test("starts with the six built-ins", async () => {
    expect((await mockApi.roleLabels()).map((l) => l.name)).toEqual(["Power", "Primary", "Secondary", "Strength", "Auxiliary", "Core"]);
  });

  test("create after a label, refuse duplicates, edit, archive and restore", async () => {
    const made = await mockApi.createRoleLabel({ name: "  Mock  Speed ", description: "Fast reps", after: "power" });
    expect(made).toMatchObject({ name: "Mock Speed", chip: "Mock Speed", rank: 150, category: null });
    expect(made.key).toBe(`label:${made.id}`);
    await expect(mockApi.createRoleLabel({ name: "mock speed", description: "x" })).rejects.toThrow("already a label");
    await expect(mockApi.createRoleLabel({ name: "Core", description: "x" })).rejects.toThrow("already a label");
    await expect(mockApi.createRoleLabel({ name: "Blank", description: "  " })).rejects.toThrow("say what the label means");

    const edited = await mockApi.patchRoleLabel(made.id!, { chip: "Spd", description: "Quick" });
    expect(edited).toMatchObject({ chip: "Spd", description: "Quick" });

    const archived = await mockApi.archiveRoleLabel(made.id!);
    expect(archived.archived).toBe(true);
    const back = await mockApi.createRoleLabel({ name: "Mock Speed", description: "Again" });
    expect(back).toMatchObject({ id: made.id, archived: false, description: "Again" });
  });

  test("a built-in's meaning changes, its name doesn't; empty resets", async () => {
    const s = await mockApi.patchRoleLabel("strength", { description: "Heavy." });
    expect(s).toMatchObject({ key: "strength", name: "Strength", description: "Heavy." });
    await expect(mockApi.patchRoleLabel("strength", { name: "Max" })).rejects.toThrow("keep their name");
    const reset = await mockApi.patchRoleLabel("strength", { description: "" });
    expect(reset.description).toContain("maximal force");
    await expect(mockApi.archiveRoleLabel("core")).rejects.toThrow();
  });
});
