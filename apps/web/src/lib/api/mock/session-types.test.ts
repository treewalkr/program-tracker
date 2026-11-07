import { describe, expect, test } from "bun:test";
import { SESSION_TYPE_DEFAULTS } from "@pt/shared";
import { mockApi } from "./api";

describe("mockApi session types (mirrors /v1/session-types)", () => {
  test("starts with the defaults", async () => {
    const types = await mockApi.sessionTypes();
    expect(types.map((t) => t.name)).toEqual(SESSION_TYPE_DEFAULTS.map((d) => d.name));
  });

  test("create, duplicate refusal, rename, archive, delete", async () => {
    const made = await mockApi.createSessionType({ name: "  Mock   Test ", format: "cardio" });
    expect(made).toMatchObject({ name: "Mock Test", format: "cardio", archivedAt: null, usedIn: 0 });
    await expect(mockApi.createSessionType({ name: "mock test", format: "lifting" })).rejects.toThrow(
      '"mock test" is already a session type'
    );
    const renamed = await mockApi.patchSessionType(made.id, { name: "Mock Renamed", archived: true });
    expect(renamed.name).toBe("Mock Renamed");
    expect(renamed.archivedAt).not.toBeNull();
    await mockApi.deleteSessionType(made.id);
    expect((await mockApi.sessionTypes()).some((t) => t.id === made.id)).toBe(false);
  });
});
