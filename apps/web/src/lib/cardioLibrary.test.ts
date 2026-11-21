import { expect, test } from "bun:test";
import { cardioTemplatePreset } from "@pt/shared";
import { templateSummary } from "./cardioLibrary";

test("templateSummary reads a steady block and an interval session", () => {
  expect(templateSummary(cardioTemplatePreset("easy-zone2")!.prescription)).toBe("40 min · Z2 · RPE 3");
  expect(templateSummary(cardioTemplatePreset("intervals")!.prescription)).toBe("4 × 3:00 · 33:00 total · Z5 work · RPE 8");
});
