import { describe, expect, test } from "bun:test";
import {
  renderPreferenceSignals,
  mockDistillPreferences,
  combinePreferenceDocs,
  type PreferenceSignal,
} from "./index";

describe("preferences helpers", () => {
  test("renderPreferenceSignals, mock cap, and combinePreferenceDocs", () => {
    // 1. renderPreferenceSignals
    const signals: PreferenceSignal[] = [
      {
        kind: "revision",
        clientName: "Maya",
        at: "2026-10-31T05:00:00.000Z",
        text: "msg",
      },
      {
        kind: "instruction",
        clientName: null,
        at: "2026-10-30T12:00:00.000Z",
        text: "no machines",
      },
    ];

    expect(renderPreferenceSignals(signals)).toBe(
      "- revision · Maya · 2026-10-31: msg\n- instruction · trainer-wide · 2026-10-30: no machines"
    );

    // 2. mockDistillPreferences with empty signals
    expect(mockDistillPreferences([])).toBe("Mock distilled preferences:");

    // 3. mockDistillPreferences with > 50 signals
    const manySignals: PreferenceSignal[] = Array.from({ length: 55 }, (_, i) => ({
      kind: "revision" as const,
      clientName: "Maya",
      at: "2026-10-31T05:00:00.000Z",
      text: `signal ${i + 1}`,
    }));
    const mockOutput = mockDistillPreferences(manySignals);
    const mockLines = mockOutput.split("\n");
    expect(mockLines[0]).toBe("Mock distilled preferences:");
    expect(mockLines[1]).toBe("- revision · Maya · 2026-10-31: signal 1");
    expect(mockLines[50]).toBe("- revision · Maya · 2026-10-31: signal 50");
    expect(mockLines[51]).toBe("(+ 5 more signals)");
    expect(mockLines.length).toBe(52);
    expect(mockOutput.length).toBeLessThanOrEqual(4000);

    // 4. combinePreferenceDocs
    expect(combinePreferenceDocs("Trainer doc", null)).toBe("Trainer doc");
    expect(combinePreferenceDocs(null, "Client doc")).toBe("Client doc");
    expect(combinePreferenceDocs("  Trainer doc  ", "  Client doc  ")).toBe(
      "Trainer doc\n\nClient-specific preferences:\nClient doc"
    );
    expect(combinePreferenceDocs(null, null)).toBeNull();
    expect(combinePreferenceDocs("", "")).toBeNull();
    expect(combinePreferenceDocs("   ", "   ")).toBeNull();
  });
});
