import { describe, expect, test } from "bun:test";
import { INSTRUCTION_PRESETS, InstructionTemplateInput } from "./index";

describe("INSTRUCTION_PRESETS", () => {
  test("every preset is a valid template with a unique key", () => {
    for (const p of INSTRUCTION_PRESETS) {
      expect(InstructionTemplateInput.safeParse({ name: p.name, content: p.content }).success).toBe(true);
      expect(p.sources.length).toBeGreaterThan(0);
    }
    expect(new Set(INSTRUCTION_PRESETS.map((p) => p.key)).size).toBe(INSTRUCTION_PRESETS.length);
  });

  test("every body opens with a headed list", () => {
    for (const p of INSTRUCTION_PRESETS) expect(p.content).toMatch(/^(Rules|Steps|Constraints):\n- /);
  });
});
