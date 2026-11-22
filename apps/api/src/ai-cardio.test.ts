import { describe, expect, test } from "bun:test";
import { AiProgramDraft, cardioTotals, computeHrZones, DraftSession } from "@pt/shared";
import { buildGenerationMessages, buildRevisionMessages, buildWeekMessages, hrProfileLine } from "./ai/prompt";
import { mockBlockDraft } from "./ai/mock";

const ctxBase = { previousProgram: null, periodization: null, chainBalance: null, history: [], catalog: [], trainerInstructions: "" };

describe("AI cardio: shape, HR profile and session load", () => {
  test("the schema shows intervals, pace and what each zone means", () => {
    const { system } = buildGenerationMessages({ ...ctxBase, client: { name: "Nok", sessionsPerWeek: 3 } });
    for (const field of ['"intervals"', '"paceSecPerKm"', '"recovery"', '"warmup" | "work" | "active_recovery" | "passive_recovery" | "cooldown"']) {
      expect(system).toContain(field);
    }
    expect(system).toContain("1 recovery, 2 easy aerobic, 3 moderate, 4 hard / near threshold, 5 very hard (short VO₂max reps only)");
    expect(system).toContain("CR-10 session RPE: 2 easy, 3 moderate, 5 hard, 7 very hard, 9-10 maximal");
    expect(system).not.toContain('"kind": "warmup"');
  });

  test("a member with an HR profile gets bpm per zone; without one, the never-invent rule", () => {
    const zones = computeHrZones("karvonen", { restingHr: 58, maxHr: 188 })!;
    expect(hrProfileLine(zones)).toBe(
      "HR PROFILE (bpm per zone, from the trainer): Z1 97–109, Z2 110–129, Z3 130–148, Z4 149–168, Z5 169–188. Zones: Z1 recovery, Z2 easy aerobic, Z3 moderate, Z4 hard / near threshold, Z5 very hard (short VO₂max reps only). Prescribe by hrZone; the app shows the member these bpm bands."
    );
    const withZones = buildGenerationMessages({ ...ctxBase, client: { name: "Nok", hrZones: zones } });
    expect(withZones.user).toContain("Z2 110–129");
    expect(withZones.user).not.toContain("58");
    expect(withZones.user).not.toContain("zones approximate");
    const untested = buildGenerationMessages({ ...ctxBase, client: { name: "Nok", hrZones: zones, hrMaxUntested: true } });
    expect(untested.user).toContain("Max HR not tested — zones approximate: pair every zone with a targetRpe.");
    const none = buildGenerationMessages({ ...ctxBase, client: { name: "Nok", cardioTarget: { unit: "minutes", value: 120 } } });
    expect(none.user).toContain("HR PROFILE: none");
    expect(none.user).toContain("never invent HRmax, LTHR, resting HR or VO₂max");
    // a strength-only member's prompt stays as it was
    expect(buildGenerationMessages({ ...ctxBase, client: { name: "Lift" } }).user).not.toContain("HR PROFILE");
    const week = buildWeekMessages({ ...ctxBase, client: { name: "Nok", hrZones: zones }, targetWeek: 2, plannedWeeks: 4, weekDirective: null } as never);
    expect(week.user).toContain("HR PROFILE (bpm per zone");
  });

  test("a session-load target sizes cardio by RPE × minutes", () => {
    const { system, user } = buildGenerationMessages({ ...ctxBase, client: { name: "Nok", cardioTarget: { unit: "session_load", value: 600 } } });
    expect(user).toContain("CARDIO TARGET (per week): 600 AU");
    expect(user).toContain("so their session load (targetRpe × minutes) add up to it");
    expect(system).toContain("session load (AU = session RPE × minutes)");
    expect(system).toContain("Every cardio session states a targetRpe");
  });

  test("the revision prompt carries the HR line too", () => {
    const previousDraft: AiProgramDraft = { name: "B", rationale: "r", clientSummary: "c", weeks: [{ week: 1, sessions: [] }] } as never;
    const zones = computeHrZones("hrmax", { maxHr: 190 })!;
    const r = buildRevisionMessages({ ...ctxBase, client: { name: "Nok", hrZones: zones }, previousDraft, feedback: "more cardio" } as never);
    expect(r.user).toContain("HR PROFILE (bpm per zone");
  });

  test("the mock draft emits a 30-minute interval session that parses", () => {
    const draft = mockBlockDraft({ plannedWeeks: 4 });
    const cardio = draft.weeks[0].sessions.find((s) => s.kind === "cardio")!;
    expect(DraftSession.safeParse(cardio).success).toBe(true);
    expect(cardio.cardio!.intervals).toHaveLength(3);
    expect(cardioTotals(cardio.cardio!).durationSec).toBe(30 * 60);
  });

  test("an AI draft with messy intervals is coerced, never rejected", () => {
    const parsed = DraftSession.safeParse({
      name: "Tempo",
      kind: "cardio",
      cardio: {
        modality: "Running",
        hrBpm: { min: 180, max: 120 },
        intervals: [{ type: "work", repeat: 3, durationSec: 600, hrZone: 9 }, { type: "jog" }, "nope"],
      },
    });
    expect(parsed.success).toBe(true);
    const rx = parsed.data!.cardio!;
    expect(rx.hrBpm).toBeUndefined();
    expect(rx.intervals).toEqual([{ id: "i1", type: "work", repeat: 3, durationSec: 600 }]);
  });

  test("the HR line names the zone method and what Z4/Z5 mean under it", () => {
    const zones = computeHrZones("karvonen", { restingHr: 58, maxHr: 188 })!;
    const k = hrProfileLine(zones, { method: "karvonen", maxUntested: true });
    expect(k).toContain("Method: Karvonen (% of heart-rate reserve).");
    expect(k).toContain("Z4 hard / near threshold, Z5 very hard (short VO₂max reps only)");
    expect(k).toContain("Max HR not tested — zones approximate");
    const lthr = hrProfileLine(computeHrZones("lthr", { lthr: 170 })!, { method: "lthr" });
    expect(lthr).toContain("Method: %LTHR (lactate-threshold HR).");
    expect(lthr).toContain("Z4 hard — just below threshold, Z5 at or above threshold");
    expect(lthr).not.toContain("not tested");
    // the method reaches the prompt from the client context
    const { user } = buildGenerationMessages({ ...ctxBase, client: { name: "Ploy", hrZones: zones, hrZoneMethod: "karvonen", hrMaxUntested: true } });
    expect(user).toContain("Method: Karvonen");
    expect(user).toContain("zones approximate");
  });

  test("cardio science rules: CR-10 anchors, hard-session cap by experience, honest names, race paces", () => {
    const runner = { name: "Ploy", trainingDays: [1, 4], cardioDays: [2, 3, 6], longRunDay: 6, cardioTarget: { unit: "session_load" as const, value: 600 } };
    const { system } = buildGenerationMessages({ ...ctxBase, client: { ...runner, experience: "intermediate" } });
    expect(system).toContain("targetRpe is CR-10 session RPE — 2 easy, 3 moderate, 5 hard, 7 very hard, 9–10 maximal");
    expect(system).toContain("Easy, recovery and long runs are RPE 2–3");
    expect(system).toContain("at most 2 a week");
    expect(system).toContain('Call it "VO₂max" only when the work reps are zone 5 at rep rpe 8–9, 2–5 min each, with recovery roughly equal to the work');
    expect(system).toContain("threshold/tempo ≈ 10–15 s/km slower than 10K pace, VO₂max reps ≈ 10–20 s/km faster, easy and long runs ≈ 60–90 s/km slower");
    expect(system).toContain('tempo, threshold and interval sessions (zone 4–5 work) are "Anaerobic endurance"');
    // the member's own cardio days come first, and the same-day heavy-lower rule is spelled out
    expect(system).toContain("cardio first on the member's cardio days Tue, Wed, Sat, and on Mon, Thu only when those run out; the long run on Sat.");
    expect(system).toContain("heavy lower-body lifting is never on the same day as a key run");

    const novice = buildGenerationMessages({ ...ctxBase, client: { ...runner, experience: "beginner" } });
    expect(novice.system).toContain("at most 1 a week — this client is a beginner");
    // a strength-only member gets none of it
    const lift = buildGenerationMessages({ ...ctxBase, client: { name: "Lift", sessionsPerWeek: 3 } });
    expect(lift.system).not.toContain("CR-10 session RPE —");
    expect(lift.system).not.toContain("Hard cardio sessions");
  });
});
