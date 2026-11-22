import { estimateVo2, VO2_FORMULAS, VO2_LIMITS as V, type Vo2Member, type Vo2Protocol, type Vo2Result } from "@pt/shared";
import { formatDuration } from "$lib/ui/input/duration";
import { fmtWeight } from "./units.svelte";

/**
 * VO₂max field tests on the member page: the entry form per protocol, the
 * live estimate (the same shared formula the server stores), and the history.
 * Results are always labelled estimated.
 */

export const PROTOCOL_LABEL: Record<Vo2Protocol, string> = {
  cooper_12min: "Cooper 12-minute run",
  run_1_5mile: "1.5-mile run",
  rockport_walk: "Rockport 1-mile walk",
};

/** The Segmented history switch. */
export const PROTOCOL_SHORT: Record<Vo2Protocol, string> = {
  cooper_12min: "Cooper",
  run_1_5mile: "1.5 mi",
  rockport_walk: "Rockport",
};

/** The picker's one-line explanation (Select 07). */
export const PROTOCOL_HINT: Record<Vo2Protocol, string> = {
  cooper_12min: "Distance covered in 12 minutes of running",
  run_1_5mile: "Finishing time for 1.5 miles (2.4 km)",
  rockport_walk: "Time and finishing HR for a brisk 1-mile walk; for beginners",
};

/** The equation as the card shows it. */
export const PROTOCOL_FORMULA: Record<Vo2Protocol, string> = {
  cooper_12min: "(distance − 504.9) ÷ 44.73",
  run_1_5mile: "3.5 + 483 ÷ minutes",
  rockport_walk: "132.853 − 0.0769·lb − 0.3877·age + 6.315·sex − 3.2649·min − 0.1565·HR",
};

export interface AssessmentForm {
  protocol: Vo2Protocol;
  testedOn: string;
  distanceM: number | null;
  timeSec: number | null;
  heartRate: number | null;
  weightKg: number | null;
  notes: string;
}

export function emptyAssessmentForm(today: string, weightKg: number | null = null, protocol: Vo2Protocol = "cooper_12min"): AssessmentForm {
  return { protocol, testedOn: today, distanceM: null, timeSec: null, heartRate: null, weightKg, notes: "" };
}

/** The inputs the protocol takes, or null while one is blank. */
export function assessmentInputs(f: AssessmentForm): Record<string, number> | null {
  if (f.protocol === "cooper_12min") return f.distanceM != null ? { distanceM: Math.round(f.distanceM) } : null;
  if (f.protocol === "run_1_5mile") return f.timeSec != null ? { timeSec: Math.round(f.timeSec) } : null;
  return f.timeSec != null && f.heartRate != null && f.weightKg != null ? { timeSec: Math.round(f.timeSec), heartRate: Math.round(f.heartRate), weightKg: f.weightKg } : null;
}

/** The schema's complaint as a sentence that names the field and its range. */
const plainError = (e: string, protocol: Vo2Protocol) => {
  if (/distanceM/.test(e)) return `Distance covered must be ${V.cooperDistanceM.min.toLocaleString("en-US")}–${V.cooperDistanceM.max.toLocaleString("en-US")} m.`;
  if (/timeSec/.test(e)) {
    const r = protocol === "rockport_walk" ? V.rockportTimeSec : V.run15TimeSec;
    return `${protocol === "rockport_walk" ? "Walk time" : "Finishing time"} must be ${formatDuration(r.min)}–${formatDuration(r.max)}.`;
  }
  if (/heartRate/.test(e)) return `Finishing HR must be ${V.rockportHr.min}–${V.rockportHr.max} bpm.`;
  if (/weightKg/.test(e)) return `Weight must be ${V.weightKg.min}–${V.weightKg.max} kg.`;
  return e[0].toUpperCase() + e.slice(1) + ".";
};

/** The live estimate: null while inputs are blank, else the shared formula's result in plain words. */
export function liveEstimate(f: AssessmentForm, member: Vo2Member): Vo2Result | null {
  const inputs = assessmentInputs(f);
  if (!inputs || !f.testedOn) return null;
  const r = estimateVo2(f.protocol, inputs, member, f.testedOn);
  return r.ok ? (r.warning ? { ...r, warning: plainError(r.warning, f.protocol) } : r) : { ok: false, error: plainError(r.error, f.protocol) };
}

/** "Cooper 12-min · formula cooper-1968: (distance − 504.9) ÷ 44.73" */
export const formulaLine = (p: Vo2Protocol) => `${PROTOCOL_SHORT[p]} · formula ${VO2_FORMULAS[p].version}: ${PROTOCOL_FORMULA[p]}`;

type Saved = { id: string; protocol: Vo2Protocol; testedOn: string; inputs: Record<string, number>; result: number; formulaVersion: string; notes: string | null };

/** "2,560 m", "11:45", "16:20 · HR 128 · 61.5 kg". */
export function inputsText(a: Pick<Saved, "protocol" | "inputs">): string {
  const i = a.inputs;
  if (a.protocol === "cooper_12min") return `${(i.distanceM ?? 0).toLocaleString("en-US")} m`;
  if (a.protocol === "run_1_5mile") return formatDuration(i.timeSec);
  return [formatDuration(i.timeSec), i.heartRate ? `HR ${i.heartRate}` : null, i.weightKg ? fmtWeight(i.weightKg) : null].filter(Boolean).join(" · ");
}

/** The protocols the member has results for, most tests first; the switch offers only these. */
export function protocolsTested(list: readonly Saved[]): Vo2Protocol[] {
  const n = new Map<Vo2Protocol, number>();
  for (const a of list) n.set(a.protocol, (n.get(a.protocol) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

/** One protocol's results, oldest first, for the chart. */
export function assessmentSeries(list: readonly Saved[], protocol: Vo2Protocol): { date: string; value: number }[] {
  return list
    .filter((a) => a.protocol === protocol)
    .sort((a, b) => a.testedOn.localeCompare(b.testedOn))
    .map((a) => ({ date: a.testedOn.slice(0, 10), value: a.result }));
}
