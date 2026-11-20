import { describe, expect, test } from "bun:test";
import { INSTRUCTION_PRESETS, INSTRUCTIONS_MAX, InstructionTemplateInput, NOTE_MAX, TEMPLATE_CONTENT_MAX } from "./index";

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

describe("INSTRUCTIONS_MAX", () => {
  test("one rule plus a full note always fits", () => {
    // the generate page joins rules and the note with "\n\n"
    expect(TEMPLATE_CONTENT_MAX + NOTE_MAX + 2).toBeLessThanOrEqual(INSTRUCTIONS_MAX);
    expect(NOTE_MAX).toBeGreaterThanOrEqual(1990);
  });
});
