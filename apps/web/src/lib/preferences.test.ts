import { describe, expect, test } from "bun:test";
import type { PreferencesDto } from "./api/types";
import { effectivePreferences } from "./preferences";

function pref(partial: Partial<PreferencesDto> = {}): PreferencesDto {
  return {
    id: "pref-1",
    clientId: null,
    clientName: null,
    document: "doc",
    providerId: "zai",
    model: "glm-4.5-flash",
    updatedAt: "2026-10-31T00:00:00Z",
    ...partial,
  };
}

describe("effectivePreferences", () => {
  test("no documents → null", () => {
    expect(effectivePreferences([], "cl-maya")).toBeNull();
  });

  test("trainer-only document applies", () => {
    const trainer = pref({ document: "Cap RPE at 8." });
    expect(effectivePreferences([trainer], "cl-maya")).toBe("Cap RPE at 8.");
  });

  test("client-only document applies", () => {
    const client = pref({ clientId: "cl-maya", clientName: "Maya", document: "No overhead pressing." });
    expect(effectivePreferences([client], "cl-maya")).toBe("No overhead pressing.");
  });

  test("both documents merge trainer-first with the client separator", () => {
    const trainer = pref({ document: "Cap RPE at 8." });
    const client = pref({ clientId: "cl-maya", clientName: "Maya", document: "No overhead pressing." });
    expect(effectivePreferences([trainer, client], "cl-maya")).toBe(
      "Cap RPE at 8.\n\nClient-specific preferences:\nNo overhead pressing."
    );
  });

  test("another client's document is ignored", () => {
    const other = pref({ clientId: "cl-jon", clientName: "Jon", document: "Jon's rules." });
    expect(effectivePreferences([other], "cl-maya")).toBeNull();
  });
});
