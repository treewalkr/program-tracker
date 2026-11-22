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
    expect(system).toContain("1 recovery, 2 easy aerobic, 3 steady, 4 threshold, 5 max");
    expect(system).not.toContain('"kind": "warmup"');
  });

  test("a member with an HR profile gets bpm per zone; without one, the never-invent rule", () => {
    const zones = computeHrZones("karvonen", { restingHr: 58, maxHr: 188 })!;
    expect(hrProfileLine(zones)).toBe(
      "HR PROFILE (bpm per zone, from the trainer): Z1 97–109, Z2 110–129, Z3 130–148, Z4 149–168, Z5 169–188. Prescribe by hrZone; the app shows the member these bpm bands."
    );
    const withZones = buildGenerationMessages({ ...ctxBase, client: { name: "Nok", hrZones: zones } });
    expect(withZones.user).toContain("Z2 110–129");
    expect(withZones.user).not.toContain("58");
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
});
