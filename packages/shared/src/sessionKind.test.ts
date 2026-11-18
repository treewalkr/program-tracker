import { describe, expect, test } from "bun:test";
import {
  AiProgramDraft,
  DraftSession,
  ImportChunk,
  ImportSession,
  KIND_ALIAS,
  PortalSession,
  ProgramSession,
  ProgramWeek,
  ProgramWeeksDocument,
  SESSION_KINDS,
  SessionKind,
  SessionLog,
  kindForType,
  logToInput,
  normalizeKind,
  normalizeKinds,
  portalSession,
  typeFitsKind,
  upgradeDraft,
  type SessionTypeFormat,
} from "./index";

// Release 2 of docs/kind-rename-plan.md: "lifting" (the release-1 value, still in
// AI history, device drafts and old files) reads as "exercises"; "exercises" is
// canonical. Everything below must parse old data.

const uuid = () => crypto.randomUUID();
const set = { setNumber: 1, type: "working", amrap: false, reps: 5 };
const exercise = () => ({ id: uuid(), exerciseId: uuid(), order: 0, prescribedSets: [set] });
const liftingSession = (kind: unknown, seq = 1) => ({ id: uuid(), name: `Session ${seq}`, seq, order: 0, kind, exercises: [exercise()] });

describe("normalizeKind", () => {
  test("release 2 maps the alias lifting → exercises", () => {
    expect(KIND_ALIAS).toEqual({ from: "lifting", to: "exercises" });
    expect(normalizeKind("lifting")).toBe("exercises");
  });

  test("canonical and other values pass through untouched", () => {
    for (const v of ["exercises", "cardio", "any", "strength", "", "Exercises", null, undefined, 3]) expect(normalizeKind(v)).toBe(v);
  });

  test("SESSION_KINDS is exercises + cardio from release 2", () => {
    expect([...SESSION_KINDS]).toEqual(["exercises", "cardio"]);
  });
});

describe("normalizeKinds (documents and responses)", () => {
  test("rewrites kind and format at any depth, leaves other keys alone", () => {
    const doc = {
      kind: "lifting",
      format: "lifting",
      weeks: [{ sessions: [{ kind: "lifting", name: "lifting", exercises: [{ kind: "x" }] }, { kind: "cardio" }] }],
      types: [{ format: "lifting" }, { format: "any" }],
      note: "lifting",
      list: ["lifting"],
    };
    expect(normalizeKinds(doc)).toEqual({
      kind: "exercises",
      format: "exercises",
      weeks: [{ sessions: [{ kind: "exercises", name: "lifting", exercises: [{ kind: "x" }] }, { kind: "cardio" }] }],
      types: [{ format: "exercises" }, { format: "any" }],
      note: "lifting",
      list: ["lifting"],
    });
  });

  test("returns the same reference when nothing changes and never mutates", () => {
    const clean = { weeks: [{ sessions: [{ kind: "exercises" }, { kind: "cardio" }] }] };
    expect(normalizeKinds(clean)).toBe(clean);
    const dirty = { a: { kind: "lifting" }, b: { kind: "cardio" } };
    const out = normalizeKinds(dirty);
    expect(dirty.a.kind).toBe("lifting");
    expect(out.b).toBe(dirty.b);
  });

  test("scalars, null and non-plain objects pass through", () => {
    const d = new Date();
    expect(normalizeKinds(d)).toBe(d);
    expect(normalizeKinds(null)).toBe(null);
    expect(normalizeKinds("lifting")).toBe("lifting");
    expect(normalizeKinds(undefined)).toBe(undefined);
  });
});

describe("zod schemas read the alias", () => {
  test("SessionKind", () => {
    expect(SessionKind.parse("lifting")).toBe("exercises");
    expect(SessionKind.parse("exercises")).toBe("exercises");
    expect(SessionKind.parse("cardio")).toBe("cardio");
    for (const bad of ["strength", "any", "Exercises", "", null, 1]) expect(SessionKind.safeParse(bad).success).toBe(false);
  });

  test("ProgramSession (and its exercise-session rules apply to the alias)", () => {
    expect(ProgramSession.parse(liftingSession("lifting")).kind).toBe("exercises");
    // alias + no exercises fails the exercise-session rule, same as "exercises"
    expect(ProgramSession.safeParse({ ...liftingSession("lifting"), exercises: [] }).success).toBe(false);
    expect(ProgramSession.safeParse(liftingSession("strength")).success).toBe(false);
    // absent kind defaults to exercises
    const { kind: _k, ...noKind } = liftingSession(undefined);
    expect(ProgramSession.parse(noKind).kind).toBe("exercises");
  });

  test("ProgramWeek / ProgramWeeksDocument: an alias and an exercises session with the same seq collide", () => {
    const weeks = [{ week: 1, sessions: [liftingSession("lifting", 1), liftingSession("exercises", 2)] }];
    const parsed = ProgramWeeksDocument.parse(weeks);
    expect(parsed[0].sessions.map((s) => s.kind)).toEqual(["exercises", "exercises"]);
    expect(ProgramWeek.safeParse({ week: 1, sessions: [liftingSession("lifting", 1), liftingSession("exercises", 1)] }).success).toBe(false);
  });

  test("SessionLog", () => {
    const log = {
      id: uuid(),
      clientId: uuid(),
      programId: uuid(),
      programSessionId: null,
      date: "2026-11-18",
      kind: "lifting",
      sets: [{ id: uuid(), programExerciseId: null, exerciseId: uuid(), setNumber: 1, reps: 5 }],
    };
    expect(SessionLog.parse(log).kind).toBe("exercises");
    expect(SessionLog.safeParse({ ...log, sets: [] }).success).toBe(false);
    expect(SessionLog.safeParse({ ...log, kind: "strength" }).success).toBe(false);
  });

  test("DraftSession and AiProgramDraft (parse and upgradeDraft on DB read)", () => {
    const s = { name: "Day 1", kind: "lifting", exercises: [{ exerciseName: "Squat", prescribedSets: [set] }] };
    expect(DraftSession.parse(s).kind).toBe("exercises");
    expect(DraftSession.safeParse({ ...s, kind: "strength" }).success).toBe(false);
    const draft = { name: "Block", rationale: "r", clientSummary: "c", weeks: [{ week: 1, sessions: [s] }] };
    expect(AiProgramDraft.parse(draft).weeks[0].sessions[0].kind).toBe("exercises");
    // the raw DB read (draftJsonb → upgradeDraft) normalizes without zod
    const upgraded = upgradeDraft(draft) as { weeks: { sessions: { kind: string }[] }[] };
    expect(upgraded.weeks[0].sessions[0].kind).toBe("exercises");
    // legacy one-week drafts too
    const legacy = upgradeDraft({ name: "Block", rationale: "r", clientSummary: "c", sessions: [s] }) as { weeks: { sessions: { kind: string }[] }[] };
    expect(legacy.weeks.every((w) => w.sessions[0].kind === "exercises")).toBe(true);
  });

  test("ImportSession / ImportChunk (was z.enum, kind stays required)", () => {
    const s = { name: "Day 1", kind: "lifting", line: 1, exercises: [] };
    expect(ImportSession.parse(s).kind).toBe("exercises");
    expect(ImportSession.safeParse({ ...s, kind: undefined }).success).toBe(false);
    expect(ImportSession.safeParse({ ...s, kind: "strength" }).success).toBe(false);
    const chunk = ImportChunk.parse({ weeks: [{ label: null, line: null, days: [{ label: "Day 1", line: 1, sessions: [s] }] }], skipped: [] });
    expect(chunk.weeks[0].days[0].sessions[0].kind).toBe("exercises");
  });

  test("PortalSession and portalSession()", () => {
    const portal = { id: "s1", name: "A", kind: "lifting", seq: 1, weekday: null, order: 0, exercises: [], cardio: null, log: null };
    expect(PortalSession.parse(portal).kind).toBe("exercises");
    expect(PortalSession.safeParse({ ...portal, kind: "strength" }).success).toBe(false);
    // a raw program session (DB JSON, no zod) built into a portal session
    const raw = liftingSession("lifting") as unknown as ProgramSession;
    expect(portalSession(raw, null, null).kind).toBe("exercises");
  });

  test("logToInput (portal device drafts, Undo after Replace)", () => {
    const base = { clientId: "c", programId: "p", programSessionId: null, date: "2026-11-18", sets: [] };
    expect(logToInput({ ...base, kind: "lifting" as never }).kind).toBe("exercises");
    expect(logToInput({ ...base, kind: null }).kind).toBe("exercises");
    expect(logToInput({ ...base, kind: "cardio" }).kind).toBe("cardio");
  });
});

describe("session type format", () => {
  const ex = "lifting" as SessionTypeFormat;
  test("typeFitsKind reads both sides through the alias", () => {
    expect(typeFitsKind(ex, "exercises")).toBe(true);
    expect(typeFitsKind("exercises", "lifting" as never)).toBe(true);
    expect(typeFitsKind(ex, "cardio")).toBe(false);
    expect(typeFitsKind("any", "lifting" as never)).toBe(true);
    expect(typeFitsKind("cardio", "cardio")).toBe(true);
  });

  test("kindForType yields the canonical kind", () => {
    expect(kindForType(ex, "cardio")).toBe("exercises");
    expect(kindForType("any", "lifting" as never)).toBe("exercises");
    expect(kindForType("cardio", "exercises")).toBe("cardio");
  });
});
