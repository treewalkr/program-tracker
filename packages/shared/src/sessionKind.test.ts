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

// Release 1 of docs/kind-rename-plan.md: "exercises" (the release-2 value) reads
// as "lifting"; "lifting" stays canonical. A release-1 rollback onto release-2
// data must parse everything below.

const uuid = () => crypto.randomUUID();
const set = { setNumber: 1, type: "working", amrap: false, reps: 5 };
const exercise = () => ({ id: uuid(), exerciseId: uuid(), order: 0, prescribedSets: [set] });
const liftingSession = (kind: unknown, seq = 1) => ({ id: uuid(), name: `Session ${seq}`, seq, order: 0, kind, exercises: [exercise()] });

describe("normalizeKind", () => {
  test("release 1 maps the alias exercises → lifting", () => {
    expect(KIND_ALIAS).toEqual({ from: "exercises", to: "lifting" });
    expect(normalizeKind("exercises")).toBe("lifting");
  });

  test("canonical and other values pass through untouched", () => {
    for (const v of ["lifting", "cardio", "any", "strength", "", "Exercises", null, undefined, 3]) expect(normalizeKind(v)).toBe(v);
  });

  test("SESSION_KINDS stays lifting + cardio in release 1", () => {
    expect([...SESSION_KINDS]).toEqual(["lifting", "cardio"]);
  });
});

describe("normalizeKinds (documents and responses)", () => {
  test("rewrites kind and format at any depth, leaves other keys alone", () => {
    const doc = {
      kind: "exercises",
      format: "exercises",
      weeks: [{ sessions: [{ kind: "exercises", name: "exercises", exercises: [{ kind: "x" }] }, { kind: "cardio" }] }],
      types: [{ format: "exercises" }, { format: "any" }],
      note: "exercises",
      list: ["exercises"],
    };
    expect(normalizeKinds(doc)).toEqual({
      kind: "lifting",
      format: "lifting",
      weeks: [{ sessions: [{ kind: "lifting", name: "exercises", exercises: [{ kind: "x" }] }, { kind: "cardio" }] }],
      types: [{ format: "lifting" }, { format: "any" }],
      note: "exercises",
      list: ["exercises"],
    });
  });

  test("returns the same reference when nothing changes and never mutates", () => {
    const clean = { weeks: [{ sessions: [{ kind: "lifting" }, { kind: "cardio" }] }] };
    expect(normalizeKinds(clean)).toBe(clean);
    const dirty = { a: { kind: "exercises" }, b: { kind: "cardio" } };
    const out = normalizeKinds(dirty);
    expect(dirty.a.kind).toBe("exercises");
    expect(out.b).toBe(dirty.b);
  });

  test("scalars, null and non-plain objects pass through", () => {
    const d = new Date();
    expect(normalizeKinds(d)).toBe(d);
    expect(normalizeKinds(null)).toBe(null);
    expect(normalizeKinds("exercises")).toBe("exercises");
    expect(normalizeKinds(undefined)).toBe(undefined);
  });
});

describe("zod schemas read the alias", () => {
  test("SessionKind", () => {
    expect(SessionKind.parse("exercises")).toBe("lifting");
    expect(SessionKind.parse("lifting")).toBe("lifting");
    expect(SessionKind.parse("cardio")).toBe("cardio");
    for (const bad of ["strength", "any", "Exercises", "", null, 1]) expect(SessionKind.safeParse(bad).success).toBe(false);
  });

  test("ProgramSession (and its lifting rules apply to the alias)", () => {
    expect(ProgramSession.parse(liftingSession("exercises")).kind).toBe("lifting");
    // alias + no exercises fails the lifting rule, same as "lifting"
    expect(ProgramSession.safeParse({ ...liftingSession("exercises"), exercises: [] }).success).toBe(false);
    expect(ProgramSession.safeParse(liftingSession("strength")).success).toBe(false);
    // absent kind still defaults to lifting
    const { kind: _k, ...noKind } = liftingSession(undefined);
    expect(ProgramSession.parse(noKind).kind).toBe("lifting");
  });

  test("ProgramWeek / ProgramWeeksDocument: an alias and a lifting session with the same seq collide", () => {
    const weeks = [{ week: 1, sessions: [liftingSession("exercises", 1), liftingSession("lifting", 2)] }];
    const parsed = ProgramWeeksDocument.parse(weeks);
    expect(parsed[0].sessions.map((s) => s.kind)).toEqual(["lifting", "lifting"]);
    expect(ProgramWeek.safeParse({ week: 1, sessions: [liftingSession("exercises", 1), liftingSession("lifting", 1)] }).success).toBe(false);
  });

  test("SessionLog", () => {
    const log = {
      id: uuid(),
      clientId: uuid(),
      programId: uuid(),
      programSessionId: null,
      date: "2026-11-18",
      kind: "exercises",
      sets: [{ id: uuid(), programExerciseId: null, exerciseId: uuid(), setNumber: 1, reps: 5 }],
    };
    expect(SessionLog.parse(log).kind).toBe("lifting");
    expect(SessionLog.safeParse({ ...log, sets: [] }).success).toBe(false);
    expect(SessionLog.safeParse({ ...log, kind: "strength" }).success).toBe(false);
  });

  test("DraftSession and AiProgramDraft (parse and upgradeDraft on DB read)", () => {
    const s = { name: "Day 1", kind: "exercises", exercises: [{ exerciseName: "Squat", prescribedSets: [set] }] };
    expect(DraftSession.parse(s).kind).toBe("lifting");
    expect(DraftSession.safeParse({ ...s, kind: "strength" }).success).toBe(false);
    const draft = { name: "Block", rationale: "r", clientSummary: "c", weeks: [{ week: 1, sessions: [s] }] };
    expect(AiProgramDraft.parse(draft).weeks[0].sessions[0].kind).toBe("lifting");
    // the raw DB read (draftJsonb → upgradeDraft) normalizes without zod
    const upgraded = upgradeDraft(draft) as { weeks: { sessions: { kind: string }[] }[] };
    expect(upgraded.weeks[0].sessions[0].kind).toBe("lifting");
    // legacy one-week drafts too
    const legacy = upgradeDraft({ name: "Block", rationale: "r", clientSummary: "c", sessions: [s] }) as { weeks: { sessions: { kind: string }[] }[] };
    expect(legacy.weeks.every((w) => w.sessions[0].kind === "lifting")).toBe(true);
  });

  test("ImportSession / ImportChunk (was z.enum, kind stays required)", () => {
    const s = { name: "Day 1", kind: "exercises", line: 1, exercises: [] };
    expect(ImportSession.parse(s).kind).toBe("lifting");
    expect(ImportSession.safeParse({ ...s, kind: undefined }).success).toBe(false);
    expect(ImportSession.safeParse({ ...s, kind: "strength" }).success).toBe(false);
    const chunk = ImportChunk.parse({ weeks: [{ label: null, line: null, days: [{ label: "Day 1", line: 1, sessions: [s] }] }], skipped: [] });
    expect(chunk.weeks[0].days[0].sessions[0].kind).toBe("lifting");
  });

  test("PortalSession and portalSession()", () => {
    const portal = { id: "s1", name: "A", kind: "exercises", seq: 1, weekday: null, order: 0, exercises: [], cardio: null, log: null };
    expect(PortalSession.parse(portal).kind).toBe("lifting");
    expect(PortalSession.safeParse({ ...portal, kind: "strength" }).success).toBe(false);
    // a raw program session (DB JSON, no zod) built into a portal session
    const raw = liftingSession("exercises") as unknown as ProgramSession;
    expect(portalSession(raw, null, null).kind).toBe("lifting");
  });

  test("logToInput (portal device drafts, Undo after Replace)", () => {
    const base = { clientId: "c", programId: "p", programSessionId: null, date: "2026-11-18", sets: [] };
    expect(logToInput({ ...base, kind: "exercises" as never }).kind).toBe("lifting");
    expect(logToInput({ ...base, kind: null }).kind).toBe("lifting");
    expect(logToInput({ ...base, kind: "cardio" }).kind).toBe("cardio");
  });
});

describe("session type format", () => {
  const ex = "exercises" as SessionTypeFormat;
  test("typeFitsKind reads both sides through the alias", () => {
    expect(typeFitsKind(ex, "lifting")).toBe(true);
    expect(typeFitsKind("lifting", "exercises" as never)).toBe(true);
    expect(typeFitsKind(ex, "cardio")).toBe(false);
    expect(typeFitsKind("any", "exercises" as never)).toBe(true);
    expect(typeFitsKind("cardio", "cardio")).toBe(true);
  });

  test("kindForType yields the canonical kind", () => {
    expect(kindForType(ex, "cardio")).toBe("lifting");
    expect(kindForType("any", "exercises" as never)).toBe("lifting");
    expect(kindForType("cardio", "lifting")).toBe("cardio");
  });
});
