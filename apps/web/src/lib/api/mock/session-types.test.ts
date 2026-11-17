import { describe, expect, test } from "bun:test";
import { SESSION_TYPE_PRESETS } from "@pt/shared";
import { mockApi } from "./api";

describe("mockApi session types (mirrors /v1/session-types)", () => {
  test("starts with the presets, then a custom type", async () => {
    const types = await mockApi.sessionTypes();
    expect(types.map((t) => [t.name, t.presetKey])).toEqual([
      ...SESSION_TYPE_PRESETS.map((p) => [p.name, p.key]),
      ["Hypertrophy", null],
    ]);
    expect(types.find((t) => t.presetKey === "metabolic")?.format).toBe("any");
  });

  test("create, duplicate refusal, rename, archive, delete", async () => {
    const made = await mockApi.createSessionType({ name: "  Mock   Test ", format: "cardio" });
    expect(made).toMatchObject({ name: "Mock Test", format: "cardio", presetKey: null, archivedAt: null, usedIn: 0 });
    await expect(mockApi.createSessionType({ name: "mock test", format: "lifting" })).rejects.toThrow(
      '"mock test" is already a session type'
    );
    await expect(mockApi.createSessionType({ name: "amrap", format: "lifting" })).rejects.toThrow('"amrap" is already a session type');
    const renamed = await mockApi.patchSessionType(made.id, { name: "Mock Renamed", archived: true });
    expect(renamed.name).toBe("Mock Renamed");
    expect(renamed.archivedAt).not.toBeNull();
    await mockApi.deleteSessionType(made.id);
    expect((await mockApi.sessionTypes()).some((t) => t.id === made.id)).toBe(false);
  });

  test("presets are locked: archive and restore only", async () => {
    const circuit = (await mockApi.sessionTypes()).find((t) => t.presetKey === "metabolic.circuit")!;
    await expect(mockApi.patchSessionType(circuit.id, { name: "Circuits" })).rejects.toThrow("preset types can't be edited");
    await expect(mockApi.patchSessionType(circuit.id, { format: "cardio" })).rejects.toThrow("preset types can't be edited");
    await expect(mockApi.deleteSessionType(circuit.id)).rejects.toThrow("preset types can only be archived");
    expect((await mockApi.patchSessionType(circuit.id, { archived: true })).archivedAt).not.toBeNull();
    expect((await mockApi.patchSessionType(circuit.id, { archived: false })).archivedAt).toBeNull();
  });
});
