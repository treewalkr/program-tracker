import { describe, expect, test } from "bun:test";
import type { ClientDto, GenerationDto, InstructionTemplateDto, ProgramDto, SessionLogDto } from "./api/types";
import {
  composeRequest,
  generateSubtitle,
  instructionsPreview,
  ledgerRows,
  pendingProgram,
  recentLogCount,
  starterMode,
  STARTERS,
  summaryLine,
} from "./generateForm";

const mkProgram = (o: Partial<ProgramDto> & { id: string }): ProgramDto => ({
  clientId: "c1",
  name: "Base",
  description: null,
  status: "draft",
  version: 1,
  aiAssisted: true,
  createdFromProgramId: null,
  weeks: [],
  createdAt: "2026-11-01T00:00:00Z",
  ...o,
});
const mkGen = (o: Partial<GenerationDto> & { id: string }): GenerationDto => ({
  clientId: "c1",
  basedOnProgramId: null,
  kind: "block",
  targetWeek: null,
  providerId: "zai",
  model: "m",
  status: "approved",
  draft: null,
  error: null,
  parentGenerationId: null,
  revisionMessage: null,
  instructions: null,
  rejectReason: null,
  approvedProgramId: null,
  exampleProgramIds: [],
  createdAt: "2026-11-01T00:00:00Z",
  ...o,
});
const mkClient = (o: Partial<ClientDto> = {}): ClientDto => ({
  id: "c1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  status: "active",
  goals: null,
  limitations: null,
  sessionsPerWeek: null,
  ...o,
});
const mkLog = (id: string, date: string): SessionLogDto => ({
  id,
  clientId: "c1",
  programId: "p1",
  programSessionId: null,
  date,
  kind: "lifting",
  notes: null,
  perceivedEnergy: null,
  sets: [],
});
const mkTpl = (id: string, content: string, name = id): InstructionTemplateDto => ({
  id,
  name,
  content,
  updatedAt: "2026-11-01T00:00:00Z",
});

const ledgerBase = {
  clientId: "c1",
  client: mkClient(),
  current: null,
  pending: null,
  weekMode: null,
  plannedWeeks: 6,
  recentLogs: 0,
  periodContext: null,
  templates: [],
  learned: null,
  matchedExamples: 0,
};

describe("pendingProgram", () => {
  test("pendingProgram returns the draft of the newest approved block gen", () => {
    const gens = [
      mkGen({ id: "g1", approvedProgramId: "pa", createdAt: "2026-11-01T00:00:00Z" }),
      mkGen({ id: "g2", approvedProgramId: "pb", createdAt: "2026-11-03T00:00:00Z" }),
    ].reverse();
    const programs = [mkProgram({ id: "pa" }), mkProgram({ id: "pb" })];
    expect(pendingProgram(gens, programs)?.id).toBe("pb");
  });

  test("pendingProgram ignores a later approved week gen", () => {
    const gens = [
      mkGen({ id: "g1", approvedProgramId: "pa", createdAt: "2026-11-01T00:00:00Z" }),
      mkGen({ id: "g2", kind: "week", approvedProgramId: "pc", createdAt: "2026-11-04T00:00:00Z" }),
    ];
    const programs = [mkProgram({ id: "pa" }), mkProgram({ id: "pc", status: "active" })];
    expect(pendingProgram(gens, programs)?.id).toBe("pa");
  });

  test("pendingProgram is null once the program is active", () => {
    const gens = [mkGen({ id: "g", approvedProgramId: "pa" })];
    expect(pendingProgram(gens, [mkProgram({ id: "pa", status: "active" })])).toBeNull();
  });

  test("pendingProgram is null without an approved gen", () => {
    const gens = [mkGen({ id: "g1", status: "validated" }), mkGen({ id: "g2", status: "rejected" })];
    expect(pendingProgram(gens, [mkProgram({ id: "pa" })])).toBeNull();
  });
});

describe("ledgerRows", () => {
  test("program row flags an approved-but-inactive program", () => {
    const rows = ledgerRows({ ...ledgerBase, pending: mkProgram({ id: "p1", version: 1 }) });
    expect(rows.find((r) => r.key === "Program")).toEqual({
      key: "Program",
      value: "None active — v1 is approved but not active",
      lamp: "amber",
      link: { href: "/programs/p1", label: "Open program" },
    });
  });

  test("ledger lists every input in order", () => {
    const rows = ledgerRows(ledgerBase);
    expect(rows.map((r) => r.key)).toEqual([
      "Profile",
      "Limitations",
      "Program",
      "Training logs",
      "Templates",
      "Learned preferences",
      "Example programs",
    ]);
    expect(rows[1].link?.href).toBe("/clients/c1#settings");
    expect(rows[6].link?.href).toBe("/examples");
    expect(rows[4].lamp).toBe("gray");
  });

  test("block plan row only with an active program", () => {
    const rows = ledgerRows({
      ...ledgerBase,
      current: mkProgram({ id: "p2", name: "Base", version: 2, status: "active" }),
      periodContext: "week 2 of 6",
    });
    expect(rows[4]).toEqual({ key: "Block plan", value: "week 2 of 6", lamp: "green" });
    expect(rows.find((r) => r.key === "Program")?.value).toBe("Base · v2");
  });
});

describe("generateSubtitle", () => {
  const base = { firstName: "Ada", current: null, weekMode: null, plannedWeeks: 6, recentLogs: 0 };

  test("cold start subtitle says profile alone", () => {
    expect(generateSubtitle(base)).toBe(
      "Ada has no active program and no logged sessions, so this draft starts from the profile alone."
    );
  });

  test("cold start with logs counts them", () => {
    expect(generateSubtitle({ ...base, recentLogs: 3 })).toBe(
      "Ada has no active program; this draft reads the profile and 3 logged sessions from the last 8 weeks."
    );
  });

  test("active subtitle counts real logs", () => {
    const current = mkProgram({ id: "p", name: "Base", status: "active" });
    expect(generateSubtitle({ ...base, current, recentLogs: 1 })).toBe(
      "Builds on “Base” and 1 logged session from the last 8 weeks."
    );
    expect(generateSubtitle({ ...base, current })).toBe("Builds on “Base”. No sessions logged in the last 8 weeks.");
  });
});

test("recentLogCount counts only the last 56 days", () => {
  const logs = [mkLog("a", "2026-11-05"), mkLog("b", "2026-09-11"), mkLog("c", "2026-09-10")];
  expect(recentLogCount(logs, new Date("2026-11-06T12:00:00Z"))).toBe(2);
});

describe("composeRequest", () => {
  const tpl = [mkTpl("a", "rule a")];

  test("keep sends the note as direction", () => {
    expect(composeRequest({ note: " Build squat ", keep: true, weekMode: null, templates: tpl })).toEqual({
      instructions: "rule a",
      direction: "Build squat",
      directionTooLong: false,
    });
  });

  test("without keep the note follows the templates", () => {
    expect(composeRequest({ note: " Build squat ", keep: false, weekMode: null, templates: tpl })).toEqual({
      instructions: "rule a\n\nBuild squat",
      direction: "",
      directionTooLong: false,
    });
  });

  test("week mode ignores keep", () => {
    const r = composeRequest({ note: "Build squat", keep: true, weekMode: 3, templates: tpl });
    expect(r.direction).toBe("");
    expect(r.instructions).toBe("rule a\n\nBuild squat");
  });

  test("direction over 500 chars is flagged", () => {
    expect(composeRequest({ note: "x".repeat(501), keep: true, weekMode: null, templates: [] }).directionTooLong).toBe(true);
    expect(composeRequest({ note: "x".repeat(500), keep: true, weekMode: null, templates: [] }).directionTooLong).toBe(false);
  });

  test("handoff note and templates merge like before", () => {
    const r = composeRequest({ note: "n", keep: false, weekMode: null, templates: [mkTpl("a", "a"), mkTpl("b", "b")] });
    expect(r.instructions).toBe("a\n\nb\n\nn");
  });
});

test("starters follow page state", () => {
  const active = mkProgram({ id: "p", status: "active" });
  expect(starterMode(null, null)).toBe("cold");
  expect(starterMode(active, null)).toBe("active");
  expect(starterMode(active, 3)).toBe("week");
  expect(STARTERS.cold[0]).toBe("Build a first block around the main goal");
  for (const list of Object.values(STARTERS)) expect(list).toHaveLength(3);
});

test("summary line has four bits", () => {
  expect(
    summaryLine({
      client: mkClient({ goals: "Strength" }),
      current: null,
      pending: mkProgram({ id: "p1", version: 1 }),
      recentLogs: 0,
      rulesOn: 1,
    })
  ).toEqual([
    { lamp: "green", text: "Profile" },
    { lamp: "amber", text: "v1 not active" },
    { lamp: "gray", text: "No logs" },
    { lamp: "green", text: "1 rule" },
  ]);
});

test("preview mirrors the prompt lines", () => {
  expect(instructionsPreview({ direction: "D", learned: "L", instructions: "" })).toBe(
    "STANDING DIRECTION (block-level — applies to every generation of this block): D\n\nLEARNED PREFERENCES (the trainer's standing style, distilled from past feedback — apply alongside the rules above):\nL\n\nTRAINER INSTRUCTIONS: none"
  );
});
