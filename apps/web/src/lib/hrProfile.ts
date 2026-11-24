import {
  computeHrZones,
  hrPlausibilityIssues,
  HrProfileInput,
  missingHrInputs,
  zoneIssues,
  type HrZone,
  type HrZoneMethod,
} from "@pt/shared";

/**
 * The member's HR profile box: the draft a trainer edits, the zones it gives,
 * and the version to save. Pure, so the component only renders it.
 */

export const HR_METHOD_LABEL: Record<HrZoneMethod, string> = {
  hrmax: "% of max HR",
  karvonen: "Heart-rate reserve",
  lthr: "%LTHR (Friel, running)",
  custom: "Custom",
};

export const HR_METHOD_HINT: Record<HrZoneMethod, string> = {
  hrmax: "50–100 % of max HR. Needs a max HR.",
  karvonen: "Karvonen: resting HR plus 30–100 % of the reserve (max − resting). Needs resting and max HR.",
  lthr: "65–106 % of lactate-threshold HR (Friel's running zones). LTHR from a 30-min test in the same sport.",
  custom: "Your own bpm for each zone, from a lab test or a watch.",
};

const INPUT_WORD = { restingHr: "resting HR", maxHr: "max HR", lthr: "LTHR" } as const;

export interface HrDraft {
  method: HrZoneMethod;
  restingHr: number | null;
  maxHr: number | null;
  /** "" = not tested (an estimate the trainer chose to trust). */
  maxHrTestedOn: string;
  lthr: number | null;
  effectiveFrom: string;
  /** The custom table; also the starting point when switching to custom. */
  zones: HrZone[];
}

type Stored = {
  method: HrZoneMethod;
  restingHr: number | null;
  maxHr: number | null;
  maxHrTestedOn: string | null;
  lthr: number | null;
  zones: readonly HrZone[];
};

const blankZones = (): HrZone[] => [1, 2, 3, 4, 5].map((zone) => ({ zone, min: 0, max: 0 }));

/** A new version's draft: the current one's inputs, starting today. */
export function hrDraftOf(current: Stored | null, today: string): HrDraft {
  return {
    method: current?.method ?? "hrmax",
    restingHr: current?.restingHr ?? null,
    maxHr: current?.maxHr ?? null,
    maxHrTestedOn: current?.maxHrTestedOn ?? "",
    lthr: current?.lthr ?? null,
    effectiveFrom: today,
    zones: current ? current.zones.map((z) => ({ ...z })) : blankZones(),
  };
}

/** The zones the draft stands for; null with the reason when it doesn't give any yet. */
export function hrDraftZones(d: HrDraft): { zones: HrZone[] } | { missing: string } {
  if (d.method === "custom") {
    if (d.zones.some((z) => !z.min || !z.max)) return { missing: "Type a min and max bpm for every zone." };
    const issues = [...zoneIssues(d.zones), ...hrPlausibilityIssues(d).map((i) => i.message)];
    return issues.length ? { missing: cap(issues[0]) + "." } : { zones: d.zones };
  }
  const missing = missingHrInputs(d.method, d);
  if (missing.length) return { missing: `${HR_METHOD_LABEL[d.method]} needs ${missing.map((m) => INPUT_WORD[m]).join(" and ")}.` };
  const implausible = hrPlausibilityIssues(d);
  if (implausible.length) return { missing: cap(implausible[0].message) + "." };
  const zones = computeHrZones(d.method, d);
  return zones ? { zones } : { missing: "These inputs don't give zones." };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The version to save, or what's wrong. Inputs a method doesn't use are still kept (they're facts about the member). */
export function hrInputOf(d: HrDraft): { input: HrProfileInput } | { error: string } {
  const z = hrDraftZones(d);
  if ("missing" in z) return { error: z.missing };
  const candidate = {
    effectiveFrom: d.effectiveFrom,
    method: d.method,
    restingHr: d.restingHr,
    maxHr: d.maxHr,
    maxHrTestedOn: d.maxHrTestedOn || null,
    lthr: d.lthr,
    ...(d.method === "custom" ? { zones: d.zones.map((x) => ({ ...x })) } : {}),
  };
  const parsed = HrProfileInput.safeParse(candidate);
  return parsed.success ? { input: parsed.data } : { error: cap(parsed.error.issues[0].message) + "." };
}

/** "Max 188 (tested 2026-09-28) · resting 58" — the inputs a version recorded. */
export function hrInputsLine(p: Pick<Stored, "restingHr" | "maxHr" | "maxHrTestedOn" | "lthr">): string {
  const parts: string[] = [];
  if (p.maxHr) parts.push(`Max ${p.maxHr} bpm ${p.maxHrTestedOn ? `(tested ${p.maxHrTestedOn})` : "(not tested)"}`);
  if (p.restingHr) parts.push(`resting ${p.restingHr}`);
  if (p.lthr) parts.push(`LTHR ${p.lthr}`);
  return parts.join(" · ") || "No inputs recorded";
}

/** Zones from a max HR nobody measured are a guess: the line the zone table, the review and the AI carry. */
export const MAX_HR_UNTESTED = "Max HR not tested — zones approximate";

/** True when the zones lean on a max HR without a test date. */
export const maxHrUntested = (p: { method: HrZoneMethod; maxHr: number | null; maxHrTestedOn: string | null } | null | undefined) =>
  !!p && !!p.maxHr && !p.maxHrTestedOn && (p.method === "hrmax" || p.method === "karvonen");

/**
 * A new version starting before an existing one only fills the gap: the
 * version in effect on a date is the latest start on or before it. Says so,
 * or null when nothing starts after `from`.
 */
export function hrBackdateNote(versions: readonly { version: number; effectiveFrom: string }[], from: string): string | null {
  if (!from) return null;
  let next: { version: number; effectiveFrom: string } | null = null;
  for (const v of versions) {
    if (v.effectiveFrom <= from) continue;
    if (!next || v.effectiveFrom < next.effectiveFrom || (v.effectiveFrom === next.effectiveFrom && v.version > next.version)) next = v;
  }
  return next
    ? `This version only covers sessions from ${from} until ${next.effectiveFrom} — version ${next.version} takes over then.`
    : null;
}
