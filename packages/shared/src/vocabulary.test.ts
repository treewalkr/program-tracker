import { describe, expect, test } from "bun:test";
import { ImportChunk, buildImportResult } from "./import";
import { mockImportExtraction } from "./importFixture";
import { IMPORT_ABBREVIATIONS, expandAbbreviations } from "./importMatch";
import { DEFAULT_GLOSSARY, GlossaryTermInput, filterNewTerms, glossaryAbbreviations, mergeGlossary, type GlossaryRowLike } from "./vocabulary";

const row = (id: string, trainerId: string | null, term: string, meaning: string, kind: GlossaryRowLike["kind"] = "abbreviation"): GlossaryRowLike => ({
  id,
  trainerId,
  term,
  meaning,
  kind,
});

describe("glossary", () => {
  test("the seed's abbreviations are exactly the default shorthand", () => {
    expect(glossaryAbbreviations(DEFAULT_GLOSSARY)).toEqual(IMPORT_ABBREVIATIONS);
  });

  test("a personal term overrides the global one with the same term, any case", () => {
    const merged = mergeGlossary([
      row("g1", null, "SA", "single arm"),
      row("g2", null, "AMRAP", "as many reps as possible", "technique"),
      row("p1", "t1", "sa", "standing alternating"),
      row("p2", "t1", "LPD", "lat pulldown"),
    ]);
    expect(merged.map((t) => [t.id, t.scope])).toEqual([
      ["p2", "personal"],
      ["p1", "personal"],
      ["g2", "global"],
    ]);
  });

  test("expansion follows the effective glossary; other kinds and multi-word terms don't expand", () => {
    const merged = mergeGlossary([
      row("g1", null, "SA", "single arm"),
      row("p1", "t1", "SA", "Standing-Alternating"),
      row("p2", "t1", "CARs", "controlled articular rotations", "technique"),
      row("p3", "t1", "lat pd", "lat pulldown"),
    ]);
    const map = glossaryAbbreviations(merged);
    expect(map).toEqual({ sa: "standing alternating" });
    expect(expandAbbreviations("SA curl", map)).toBe("standing alternating curl");
    expect(expandAbbreviations("CARs", map)).toBe("cars");
  });

  test("input is trimmed and bounded", () => {
    expect(GlossaryTermInput.parse({ term: " LPD ", meaning: " lat pulldown ", kind: "abbreviation" })).toEqual({
      term: "LPD",
      meaning: "lat pulldown",
      kind: "abbreviation",
    });
    expect(GlossaryTermInput.safeParse({ term: " ", meaning: "x", kind: "abbreviation" }).success).toBe(false);
    expect(GlossaryTermInput.safeParse({ term: "x", meaning: "x".repeat(201), kind: "other" }).success).toBe(false);
  });
});

describe("new terms from an import", () => {
  const lines = ["Day 1", "SA Row 3x10 (PAILs/RAILs)", "Banded LPD 3x12 tempo 3-1-1", "KB swing 3x15"];

  test("drops known terms, repeats and terms not written in their line", () => {
    const out = filterNewTerms(
      [
        { term: "PAILs/RAILs", line: 2, meaning: "isometric loading" },
        { term: "LPD", line: 3, meaning: "lat pulldown" },
        { term: "lpd", line: 3, meaning: null },
        { term: "KB", line: 4, meaning: "kettlebell" },
        { term: "Zercher", line: 4, meaning: null },
        { term: " banded ", line: 3, meaning: null },
      ],
      lines,
      [{ term: "pails/rails" }, { term: "KB" }],
    );
    expect(out).toEqual([
      { term: "LPD", line: 3, meaning: "lat pulldown" },
      { term: "banded", line: 3, meaning: null },
    ]);
  });

  test("buildImportResult filters newTerms across chunks against the glossary", () => {
    const chunk = (terms: unknown[]) => ImportChunk.parse({ weeks: [], skipped: [], newTerms: terms });
    const text = lines.join("\n");
    const result = buildImportResult(
      text,
      [
        { from: 1, to: 2, ok: true, data: chunk([{ term: "SA", line: 2, meaning: "single arm" }]) },
        { from: 3, to: 4, ok: true, data: chunk([{ term: "LPD", line: 3, meaning: "  " }, { term: "LPD", line: 3 }]) },
      ],
      DEFAULT_GLOSSARY,
    );
    expect(result.newTerms).toEqual([{ term: "LPD", line: 3, meaning: null }]);
    // chunks without the field still read
    expect(ImportChunk.parse({ weeks: [] }).newTerms).toBeUndefined();
  });
});

describe("mock extraction", () => {
  test("reports a few new words deterministically; the glossary drops the known ones", () => {
    const lines = ["Day 1", "SA Row 3x10", "Bent over row (Supinate) 5x5", "Chest stretch (PAILs/RAILs)"];
    expect(mockImportExtraction(lines, 1, 4).newTerms).toEqual([
      { term: "SA", meaning: "single arm", line: 2 },
      { term: "Supinate", meaning: "palms-up grip", line: 3 },
      { term: "PAILs/RAILs", meaning: null, line: 4 },
    ]);
    const result = buildImportResult(lines.join("\n"), [{ from: 1, to: 4, ok: true, data: mockImportExtraction(lines, 1, 4) }], DEFAULT_GLOSSARY);
    expect(result.newTerms!.map((t) => t.term)).toEqual(["Supinate"]);
  });
});
