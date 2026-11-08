import { describe, expect, test } from "bun:test";
import { BUILTIN_ROLE_LABELS, type RoleLabel } from "@pt/shared";
import type { AliasDto, GlossaryTermDto } from "./api/types";
import {
  aliasOverride,
  guessKind,
  labelBefore,
  labelsInOrder,
  newWordInput,
  newWordRows,
  overriddenAliases,
  parseVocabTab,
  personalAliasFor,
  rankToMove,
  searchAliases,
  searchGlossary,
  shownNewWords,
  termOverride,
} from "./vocabulary";

const alias = (id: string, a: string, exerciseName: string, scope: AliasDto["scope"] = "personal"): AliasDto => ({
  id,
  alias: a,
  exerciseId: `ex-${exerciseName}`,
  exerciseName,
  source: scope === "global" ? "seed" : "import",
  scope,
});

const ALIASES = [alias("1", "sa row", "Single-Arm Dumbbell Row"), alias("2", "bss", "Bulgarian Split Squat", "global"), alias("3", "sa row", "Seated Cable Row", "global")];

const GLOSSARY: GlossaryTermDto[] = [
  { id: "a", term: "LPD", meaning: "lat pulldown", kind: "abbreviation", scope: "personal" },
  { id: "b", term: "AMRAP", meaning: "as many reps as possible", kind: "technique", scope: "global" },
];

describe("tabs", () => {
  test("?tab= picks a known tab, else aliases", () => {
    expect(parseVocabTab("roles")).toBe("roles");
    expect(parseVocabTab("glossary")).toBe("glossary");
    expect(parseVocabTab("nope")).toBe("aliases");
    expect(parseVocabTab(null)).toBe("aliases");
  });
});

describe("search", () => {
  test("aliases by words as written or the exercise", () => {
    expect(searchAliases(ALIASES, "").map((a) => a.id)).toEqual(["1", "2", "3"]);
    expect(searchAliases(ALIASES, "bulgarian").map((a) => a.id)).toEqual(["2"]);
    expect(searchAliases(ALIASES, "SA dumbbell").map((a) => a.id)).toEqual(["1"]);
  });

  test("glossary by term, meaning or kind", () => {
    expect(searchGlossary(GLOSSARY, "lpd").map((g) => g.id)).toEqual(["a"]);
    expect(searchGlossary(GLOSSARY, "reps possible").map((g) => g.id)).toEqual(["b"]);
    expect(searchGlossary(GLOSSARY, "technique").map((g) => g.id)).toEqual(["b"]);
  });
});

describe("override", () => {
  test("a global alias becomes a personal one with the same words", () => {
    expect(aliasOverride(ALIASES[1])).toEqual({ alias: "bss", exerciseId: "ex-Bulgarian Split Squat", source: "manual" });
    expect(aliasOverride(ALIASES[1], "ex-2").exerciseId).toBe("ex-2");
    expect(personalAliasFor(ALIASES, "sa row")?.id).toBe("1");
    expect(personalAliasFor(ALIASES, "bss")).toBeUndefined();
  });

  test("a global alias with a personal one of the same words is overridden", () => {
    expect([...overriddenAliases(ALIASES)]).toEqual(["3"]);
  });

  test("a global term becomes a personal copy", () => {
    expect(termOverride(GLOSSARY[1])).toEqual({ term: "AMRAP", meaning: "as many reps as possible", kind: "technique" });
  });
});

describe("role label order", () => {
  const labels: RoleLabel[] = BUILTIN_ROLE_LABELS.map((l) => ({ ...l }));
  const keys = (ls: RoleLabel[]) => ls.map((l) => l.key);

  test("active by rank, archived after", () => {
    const withArchived = [...labels, { ...labels[0], key: "label:x" as const, id: "x", name: "Old", rank: 50, archived: true }];
    const { active, archived } = labelsInOrder(withArchived);
    expect(keys(active)).toEqual(keys(labels));
    expect(keys(archived)).toEqual(["label:x"]);
  });

  test("move after another, first, last; no-op where it already sits", () => {
    const [power, primary, secondary] = labels;
    expect(rankToMove(labels, power.key, "")).toBeNull();
    expect(rankToMove(labels, primary.key, power.key)).toBeNull();
    expect(rankToMove(labels, secondary.key, "")).toBe(power.rank - 100);
    expect(rankToMove(labels, power.key, primary.key)).toBe((primary.rank + secondary.rank) / 2);
    expect(rankToMove(labels, power.key, labels[labels.length - 1].key)).toBe(labels[labels.length - 1].rank + 100);
    expect(labelBefore(labels, secondary.key)).toBe(primary.key);
    expect(labelBefore(labels, power.key)).toBe("");
  });
});

describe("new words panel", () => {
  test("rows from the result: suggested meaning or blank, kind guessed", () => {
    const rows = newWordRows([
      { term: "LPD", line: 3, meaning: "lat pulldown" },
      { term: "Supinate", line: 8, meaning: null },
    ]);
    expect(rows).toEqual([
      { term: "LPD", line: 3, meaning: "lat pulldown", suggested: true, kind: "abbreviation", status: "open" },
      { term: "Supinate", line: 8, meaning: "", suggested: false, kind: "technique", status: "open" },
    ]);
    expect(newWordRows(undefined)).toEqual([]);
    expect(guessKind("KBs")).toBe("abbreviation");
    expect(guessKind("PAILs/RAILs")).toBe("technique");
  });

  test("dismissed rows hide; Add needs a meaning", () => {
    const rows = newWordRows([
      { term: "LPD", line: 3, meaning: "  lat   pulldown " },
      { term: "Zercher", line: 4, meaning: null },
    ]);
    expect(newWordInput(rows[0])).toEqual({ term: "LPD", meaning: "lat pulldown", kind: "abbreviation" });
    expect(newWordInput(rows[1])).toBeNull();
    rows[1].status = "dismissed";
    rows[0].status = "added";
    expect(shownNewWords(rows).map((r) => r.term)).toEqual(["LPD"]);
  });
});
