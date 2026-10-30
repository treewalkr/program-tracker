import { describe, expect, test } from "bun:test";
import {
  DEFAULT_GENERATION_SECONDS,
  TYPICAL_GENERATION_SECONDS,
  typicalGenerationSeconds,
} from "./index";

describe("typicalGenerationSeconds", () => {
  test("typicalGenerationSeconds returns configured providers and defaults unknowns", () => {
    expect(typicalGenerationSeconds("zai")).toBe(210);
    expect(typicalGenerationSeconds("mock")).toBe(3);
    expect(typicalGenerationSeconds("unknown")).toBe(240);
    expect(typicalGenerationSeconds("unknown")).toBe(DEFAULT_GENERATION_SECONDS);
    expect(TYPICAL_GENERATION_SECONDS.zai).toBe(210);
    expect(TYPICAL_GENERATION_SECONDS.mock).toBe(3);
  });
});
