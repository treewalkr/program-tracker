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
    expect(expected.items).toHaveLength(41);
    expect(expected.items.find((e) => e.line === 9)).toMatchObject({ line: 9, sets: 4, repsList: [10, 8, 6, 5] });
    const n = expected.sessions!.length;
    expect(scoreResult(read(), expected)).toEqual({
      correct: 41,
      expected: 41,
      sessionsCorrect: n,
      sessionsExpected: n,
      sessionsRead: n,
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

  test("null means the field must be absent; logged sets and sessions are compared", () => {
    const r = read();
    const items = [
      { line: 6, seconds: null },
      { line: 6, actuals: 99 },
      { line: 6, noteHas: ["power"] },
      { line: 6, noteHas: ["kinesis"] },
    ];
    const s = scoreResult(r, { items, sessions: [{ line: 3, kind: "cardio" }], skipped: [6] });
    expect(s.correct).toBe(2);
    expect(s.misses[0]).toMatch(/^L6: logged sets \d+ ≠ 99$/);
    expect(s.misses[1]).toMatch(/lacks "kinesis"$/);
    expect(s.misses).toContain("L6: should be skipped");
    expect(s.misses).toContain("session L3: lifting ≠ cardio");
    expect(s.misses.at(-1)).toMatch(/^sessions: \d+ read ≠ 1$/);
  });
});
