import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { WEEK11_12_EXTRACTION, buildImportResult, chunkLines, importLines, mockImportExtraction } from "@pt/shared";
import { expectedFromExtraction, scoreResult } from "./lib/import-eval";

const FIXTURE = readFileSync(new URL("../../../packages/shared/fixtures/import/week11-12.txt", import.meta.url), "utf8");

describe("eval:import scoring", () => {
  const lines = importLines(FIXTURE);
  const read = () =>
    buildImportResult(FIXTURE, chunkLines(lines).map((r) => ({ ...r, ok: true as const, data: mockImportExtraction(lines, r.from, r.to) })));

  test("the hand-written extraction scores perfectly against itself", () => {
    const expected = expectedFromExtraction(WEEK11_12_EXTRACTION);
    expect(expected).toHaveLength(41);
    expect(expected.find((e) => e.line === 9)).toEqual({ line: 9, sets: 4, repsList: [10, 8, 6, 5] });
    expect(scoreResult(read(), expected)).toEqual({
      correct: 41,
      expected: 41,
      misses: [],
      numberFlags: 0,
      implausible: 0,
      unused: 0,
      unreadLines: 0,
    });
  });

  test("a wrong or missing read is a miss", () => {
    const r = read();
    r.weeks[0].days[0].sessions[0].exercises[2].prescription!.sets = 4; // L6 Pull up
    r.weeks[1].days[2].sessions[0].exercises.pop(); // L60 Leg curl
    const s = scoreResult(r, expectedFromExtraction(WEEK11_12_EXTRACTION));
    expect(s.correct).toBe(39);
    expect(s.misses).toEqual(["L6: sets 4 ≠ 3", "L60: not read"]);
  });
});
