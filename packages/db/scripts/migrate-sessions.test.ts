import { describe, expect, test } from "bun:test";
import { migrateProgramSessions } from "./migrate-sessions";

const uuid = () => crypto.randomUUID();
const exercise = () => ({
  id: uuid(),
  exerciseId: uuid(),
  order: 0,
  prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }],
});
const lifting = (name: string, order = 0) => ({ id: uuid(), name, order, kind: "lifting", exercises: [exercise()] });
const cardio = (name: string, order = 0) => ({
  id: uuid(),
  name,
  order,
  kind: "cardio",
  exercises: [],
  cardio: { modality: "Bike", durationMin: 30 },
});

const legacyWeek = (week: number) => ({
  week,
  days: [
    { id: uuid(), day: 2, weekday: 3, sessions: [lifting("Lower")] },
    { id: uuid(), day: 1, weekday: 1, sessions: [lifting("Upper"), cardio("Z2", 1)] },
    { id: uuid(), day: 3, weekday: null, sessions: [lifting("Full")] },
  ],
});

describe("migrateProgramSessions", () => {
  test("legacy days → flat sessions with seq per track, weekday from the day, ids kept", () => {
    const doc = [legacyWeek(1), legacyWeek(2)];
    const ids = doc[0].days.flatMap((d) => d.sessions.map((s) => s.id));
    const r = migrateProgramSessions(doc);
    expect(r.status).toBe("migrated");
    if (r.status !== "migrated") return;
    expect(r.weeks).toHaveLength(2);
    const w1 = r.weeks[0];
    expect("days" in w1).toBe(false);
    const byName = Object.fromEntries(w1.sessions.map((s) => [s.name, s]));
    expect(byName.Upper).toMatchObject({ kind: "lifting", seq: 1, weekday: 1, order: 0 });
    expect(byName.Z2).toMatchObject({ kind: "cardio", seq: 1, weekday: 1, order: 1 });
    expect(byName.Lower).toMatchObject({ kind: "lifting", seq: 2, weekday: 3, order: 0 });
    expect(byName.Full).toMatchObject({ kind: "lifting", seq: 3, weekday: null });
    expect(w1.sessions.map((s) => s.id).sort()).toEqual([...ids].sort());
  });

  test("idempotent: a migrated document comes back unchanged", () => {
    const first = migrateProgramSessions([legacyWeek(1)]);
    if (first.status !== "migrated") throw new Error("expected migrated");
    expect(migrateProgramSessions(first.weeks)).toEqual({ status: "unchanged" });
    expect(migrateProgramSessions(JSON.parse(JSON.stringify(first.weeks)))).toEqual({ status: "unchanged" });
  });

  test("invalid documents are reported, never written", () => {
    expect(migrateProgramSessions(null).status).toBe("invalid");
    expect(migrateProgramSessions([{ week: 2, days: [{ id: "d", day: 1, sessions: [lifting("A")] }] }]).status).toBe(
      "invalid"
    ); // weeks must start at 1
    const crowded = {
      week: 1,
      days: [
        { id: "a", day: 1, weekday: 1, sessions: [lifting("A"), lifting("B", 1), lifting("C", 2)] },
        { id: "b", day: 2, weekday: 1, sessions: [lifting("D"), lifting("E", 1)] },
      ],
    };
    const r = migrateProgramSessions([crowded]);
    expect(r.status).toBe("invalid");
    if (r.status === "invalid") expect(r.error).toContain("max 4");
  });
});
