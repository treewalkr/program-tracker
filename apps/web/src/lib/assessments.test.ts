import { describe, expect, test } from "bun:test";
import { cooperVo2 } from "@pt/shared";
import { assessmentInputs, assessmentSeries, emptyAssessmentForm, formulaLine, inputsText, liveEstimate, protocolsTested } from "./assessments";

const today = "2026-11-21";
const nok = { sex: "female" as const, birthDate: "1991-04-12" };

describe("assessments", () => {
  test("Cooper: blank gives no estimate, 2,560 m gives the mockup's 45.9", () => {
    const f = emptyAssessmentForm(today);
    expect(liveEstimate(f, nok)).toBeNull();
    expect(liveEstimate({ ...f, distanceM: 2560 }, nok)).toEqual({ ok: true, value: 45.9, formulaVersion: "cooper-1968" });
    expect(liveEstimate({ ...f, distanceM: 90 }, nok)).toEqual({ ok: false, error: "Distance covered must be 1,000–5,000 m." });
  });

  test("Rockport needs time, HR and weight, and the member's sex", () => {
    const f = { ...emptyAssessmentForm(today, 61.5, "rockport_walk"), timeSec: 980 };
    expect(assessmentInputs(f)).toBeNull();
    const full = { ...f, heartRate: 128 };
    const r = liveEstimate(full, nok);
    expect(r?.ok).toBe(true);
    expect(liveEstimate(full, { sex: null, birthDate: "1991-04-12" })).toEqual({ ok: false, error: "Rockport needs the member's sex recorded." });
    expect(inputsText({ protocol: "rockport_walk", inputs: assessmentInputs(full)! })).toBe("16:20 · HR 128 · 61.5 kg");
  });

  test("history: one protocol at a time, oldest first; the switch lists tested protocols", () => {
    const a = (id: string, protocol: "cooper_12min" | "run_1_5mile", testedOn: string, result: number) => ({ id, protocol, testedOn, inputs: {}, result, formulaVersion: "v", notes: null });
    const list = [a("3", "cooper_12min", "2026-11-21", 45.9), a("1", "cooper_12min", "2026-09-22", cooperVo2(2350)), a("2", "run_1_5mile", "2026-10-01", 44)];
    expect(assessmentSeries(list, "cooper_12min")).toEqual([
      { date: "2026-09-22", value: 41.2 },
      { date: "2026-11-21", value: 45.9 },
    ]);
    expect(protocolsTested(list)).toEqual(["cooper_12min", "run_1_5mile"]);
    expect(inputsText({ protocol: "cooper_12min", inputs: { distanceM: 2560 } })).toBe("2,560 m");
    expect(formulaLine("cooper_12min")).toBe("Cooper · formula cooper-1968: (distance − 504.9) ÷ 44.73");
  });
});

describe("range errors name the field (QA B4)", () => {
  const nok = { sex: "female" as const, birthDate: "1990-04-02" };
  const f = emptyAssessmentForm("2026-11-20");
  test("1.5 mile at 1:00 and a 4-hour Rockport are refused with the field's range", () => {
    expect(liveEstimate({ ...f, protocol: "run_1_5mile", timeSec: 60 }, nok)).toEqual({ ok: false, error: "Finishing time must be 5:30–30:00." });
    expect(liveEstimate({ ...f, protocol: "rockport_walk", timeSec: 4 * 3600, heartRate: 130, weightKg: 60 }, nok)).toEqual({ ok: false, error: "Walk time must be 8:00–30:00." });
    expect(liveEstimate({ ...f, protocol: "rockport_walk", timeSec: 900, heartRate: 230, weightKg: 60 }, nok)).toEqual({ ok: false, error: "Finishing HR must be 60–220 bpm." });
    expect(liveEstimate({ ...f, distanceM: 6000 }, nok)).toEqual({ ok: false, error: "Distance covered must be 1,000–5,000 m." });
  });
});
