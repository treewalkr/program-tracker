import {
  DEFAULT_DELOAD,
  deloadLoadFactor,
  deloadVolumeDeltaPercent,
  type DeloadSettings,
  hardSetCount,
  sessionsPatternBalance,
  weekTargetLabel,
  planChanges,
  placementConflicts,
  type PlanChange,
  type PlacementDaysInput,
  type ProgramSession,
  type ProgressionKind,
} from "@pt/shared";
import type { AiDraftWeekDto, ClientDto, ExerciseDto, GenerationDto, ProgramPhasingDto } from "./api/types";

// ---- block plan ----

export type PlanWeek = NonNullable<ProgramPhasingDto["weeks"]>[number];

// Plan diff helpers live in @pt/shared (slots.ts) so the API diff uses them too.
export { weekTargetLabel, planChanges, type PlanChange };

/**
 * Volume and load index per week, chained from each week's % target (week 1 = 100).
 * Volume targets (overall/rep) move `vol`; intensity targets move `load`.
 * A deload week without an intensity target drops load by the deload rule
 * (× 1 + loadPercent/100) — from last week's load, or from week 1's (= 100)
 * with the week-1 basis. A deload is a one-week dip: the next week resumes from
 * the last pre-deload values, so back-to-back deloads each dip from that baseline.
 */
export function planIndexes(ph: ProgramPhasingDto, deload: DeloadSettings = DEFAULT_DELOAD): { vol: number; load: number }[] {
  // Trim float noise (100 × 1.025 × 0.9 = 92.24999…) so display rounding is honest.
  const clean = (n: number) => +n.toPrecision(12);
  let vol = 100;
  let load = 100;
  return (ph.weeks ?? []).map((w) => {
    const volTarget = w.target && w.target.metric !== "intensity" ? 1 + w.target.deltaPercent / 100 : 1;
    const loadTarget = w.target && w.target.metric === "intensity" ? 1 + w.target.deltaPercent / 100 : null;
    if (w.directive === "deload") {
      const deloadLoad = deload.loadBasis === "week1" ? 100 * deloadLoadFactor(deload) : load * deloadLoadFactor(deload);
      return { vol: clean(vol * volTarget), load: clean(loadTarget != null ? load * loadTarget : deloadLoad) };
    }
    vol *= volTarget;
    load *= loadTarget ?? 1;
    return { vol: clean(vol), load: clean(load) };
  });
}

/** Default step per progression kind: one plate jump, 2.5 %1RM points, one set. */
export const PROGRESSION_STEP: Record<ProgressionKind, number> = { kg: 2.5, percent: 2.5, sets: 1 };

/** Set or clear (empty kind) a week's progression rule; a new kind starts at its default step. */
export function setProgression(w: PlanWeek, kind: ProgressionKind | "") {
  if (!kind) {
    delete w.progression;
    return;
  }
  w.progression = { kind, amount: PROGRESSION_STEP[kind] };
}

/** Inline guidance for one week: "err" blocks saving, "warn" does not. */
export function validatePlanWeek(w: PlanWeek): { kind: "err" | "warn"; text: string } | null {
  if (w.target && (!Number.isFinite(w.target.deltaPercent) || w.target.deltaPercent < -100 || w.target.deltaPercent > 200)) {
    return { kind: "err", text: "Target must be between −100% and +200%." };
  }
  const p = w.progression;
  if (p && (!Number.isFinite(p.amount) || p.amount === 0 || Math.abs(p.amount) > 50)) {
    return { kind: "err", text: "Progression must be a non-zero step between −50 and +50." };
  }
  if (p && p.kind === "sets" && !Number.isInteger(p.amount)) {
    return { kind: "err", text: "A sets progression adds whole sets." };
  }
  if (w.directive === "deload" && w.target && w.target.metric !== "intensity" && w.target.deltaPercent > 0) {
    return { kind: "warn", text: "A deload usually cuts volume." };
  }
  if ((w.directive === "+volume" || w.directive === "+intensity") && !w.target) {
    return { kind: "warn", text: "No % target — progress can't be checked against it." };
  }
  return null;
}

/** Renumber weeks 1..n and set plannedWeeks to n. */
export function normalizePlan(ph: ProgramPhasingDto): ProgramPhasingDto {
  const weeks = (ph.weeks ?? []).map((w, i) => ({ ...w, week: i + 1 }));
  return {
    ...ph,
    phase: ph.phase.trim() || "block",
    nextPhase: ph.nextPhase?.trim() ? ph.nextPhase.trim() : null,
    plannedWeeks: weeks.length || ph.plannedWeeks,
    weeks,
  };
}

/** Starting plan when a draft has none: base → +volume … → deload (the deload rule's volume cut). */
export function defaultPlan(weeks = 4, deload: DeloadSettings = DEFAULT_DELOAD): ProgramPhasingDto {
  return normalizePlan({
    phase: "accumulation",
    nextPhase: null,
    plannedWeeks: weeks,
    weeks: Array.from({ length: weeks }, (_, i) =>
      i === 0
        ? { week: 1, directive: "base" as const }
        : i === weeks - 1
          ? { week: i + 1, directive: "deload" as const, target: { metric: "overall_volume" as const, deltaPercent: deloadVolumeDeltaPercent(deload) } }
          : { week: i + 1, directive: "+volume" as const, target: { metric: "overall_volume" as const, deltaPercent: 5 } }
    ),
  });
}

/** The deload rule in force for a client (default when the DTO doesn't carry one). */
export const clientDeload = (client: Pick<ClientDto, "effectiveDeload"> | null | undefined): DeloadSettings =>
  client?.effectiveDeload ?? DEFAULT_DELOAD;

/** "a deload week drops load 10 %" / "… to 90 % of week 1" / "… keeps load", for plan legends. */
export function deloadLoadPhrase(deload: DeloadSettings = DEFAULT_DELOAD): string {
  const pct = String(Math.abs(deload.loadPercent));
  if (deload.loadBasis === "week1") return `a deload week sets load to ${100 + deload.loadPercent} % of week 1`;
  return deload.loadPercent === 0 ? "a deload week keeps load" : `a deload week drops load ${pct} %`;
}

// ---- checks ----

export interface ReviewCheck {
  /** ok = meets the client's setup · warn = worth a look · info = plain fact, no judgement. */
  tone: "ok" | "warn" | "info";
  text: string;
}

/** Facts a trainer checks before approving, computed from the draft and catalog. */
export function reviewChecks(
  /** One draft week (the one shown). */
  draft: Pick<AiDraftWeekDto, "sessions">,
  sessionsPerWeek: number | null,
  catalogById: ReadonlyMap<string, Pick<ExerciseDto, "movementPattern">>,
  /** Client availability; when given, AI weekdays are checked against the placement rules. */
  days?: PlacementDaysInput
): ReviewCheck[] {
  // Same count as the program page's week balance header (F21).
  const sets = sessionsPatternBalance(draft.sessions, (id) => catalogById.get(id)?.movementPattern);
  let total = 0;
  let maxRpe = 0;
  for (const s of draft.sessions) {
    for (const e of s.exercises) {
      total += hardSetCount(e.prescribedSets);
      for (const ps of e.prescribedSets) if (ps.targetRpe != null) maxRpe = Math.max(maxRpe, ps.targetRpe);
    }
  }
  // Cardio sessions don't count toward the client's lifting sessions per week.
  const lifting = draft.sessions.filter((s) => s.kind !== "cardio").length;
  const out: ReviewCheck[] = [];
  if (sessionsPerWeek != null) {
    const label = `${lifting} lifting ${lifting === 1 ? "session" : "sessions"}`;
    out.push(
      lifting === sessionsPerWeek
        ? { tone: "ok", text: `${label} — matches the client's ${sessionsPerWeek}/week` }
        : { tone: "warn", text: `${label} — the client lifts ${sessionsPerWeek}/week` }
    );
  }
  if (maxRpe > 0) out.push({ tone: "info", text: `Highest prescribed effort: RPE ${maxRpe}` });
  out.push({ tone: "info", text: `${total} working sets / week` });
  if (sets.push + sets.pull > 0) {
    out.push(
      sets.pull >= sets.push
        ? { tone: "ok", text: `Pull ${sets.pull} ≥ push ${sets.push} sets` }
        : { tone: "warn", text: `Push ${sets.push} > pull ${sets.pull} sets` }
    );
  }
  if (sets.knee + sets.hip > 0) out.push({ tone: "info", text: `Knee ${sets.knee} · hip ${sets.hip} sets` });
  if (days !== undefined) out.push(...weekdayChecks(draft, days, catalogById));
  return out;
}

/** AI weekdays vs the placement rules: each break is re-placed on approval (F03, F26). */
function weekdayChecks(
  draft: Pick<AiDraftWeekDto, "sessions">,
  days: PlacementDaysInput,
  catalogById: ReadonlyMap<string, Pick<ExerciseDto, "movementPattern">>
): ReviewCheck[] {
  if (!draft.sessions.some((s) => s.weekday != null)) return [];
  const seq = { lifting: 0, cardio: 0 };
  const sessions = draft.sessions.map((s, i) => {
    const kind = s.kind === "cardio" ? ("cardio" as const) : ("lifting" as const);
    return {
      id: `d${i}`,
      name: s.name,
      seq: ++seq[kind],
      order: 0,
      kind,
      weekday: s.weekday ?? null,
      exercises: s.exercises.map((e, ei) => ({ id: `d${i}e${ei}`, exerciseId: e.exerciseId ?? "", order: ei, prescribedSets: e.prescribedSets })),
      cardio: s.cardio ?? null,
    } as ProgramSession;
  });
  const conflicts = placementConflicts(sessions, days, (id) => catalogById.get(id)?.movementPattern);
  if (conflicts.length === 0) return [{ tone: "ok", text: "AI weekdays follow the client's schedule rules" }];
  return conflicts.map((c) => ({ tone: "warn" as const, text: `Weekday conflict: ${c.text} — approval re-places it` }));
}

// ---- tracks ----

/** Track label per draft session in draft order: "Session 1", "Session 2", "Cardio 1"… */
export function draftSessionTags(sessions: readonly { kind?: string | null }[]): string[] {
  const n = { lifting: 0, cardio: 0 };
  return sessions.map((s) => (s.kind === "cardio" ? `Cardio ${++n.cardio}` : `Session ${++n.lifting}`));
}

// ---- rationale ----

/** Lead or session name, comparable: "Lower — Squat focus (Mon):" → "lower - squat focus". */
const leadKey = (t: string) =>
  t
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[\s:.,;\-]+$/, "")
    .trim();

/**
 * Rationale split into markdown blocks. A block, or a bullet inside one, that
 * opens with a bold lead naming a session goes to that session (lead removed,
 * first letter capitalised); the rest are general. A lead names a session by
 * track position — "Session N" / "Cardio N" (legacy "Day N" = Nth in draft
 * order) — or by the session's own name ("**Lower — squat focus (Mon):**"),
 * which is the form the generation prompt asks for. Pass `sessions` (draft
 * kinds and names) to resolve track leads and names; without it every
 * numbered lead counts as a draft position.
 */
export function rationaleByDay(
  text: string,
  dayCount: number,
  sessions?: readonly { kind?: string | null; name?: string | null }[]
): { days: string[][]; general: string[] } {
  const days: string[][] = Array.from({ length: dayCount }, () => []);
  const general: string[] = [];
  const kinds = sessions?.map((s) => s.kind);
  const names = sessions?.map((s) => (s.name ? leadKey(s.name) : "")) ?? [];
  const indexOf = (lead: string, n: number): number => {
    if (lead === "Day" || !kinds) return n - 1;
    const want = lead === "Cardio" ? "cardio" : "lifting";
    let seen = 0;
    for (let i = 0; i < kinds.length; i++) {
      if ((kinds[i] === "cardio" ? "cardio" : "lifting") === want && ++seen === n) return i;
    }
    return -1;
  };
  /** Session index and the text after the lead, or null when the text names no session. */
  const route = (t: string): { day: number; rest: string } | null => {
    const num = t.match(/^\*\*(Day|Session|Cardio) (\d+)\b[^*]*\*\*[\s:—-]*/);
    if (num) {
      const day = indexOf(num[1], Number(num[2]));
      return day >= 0 && day < dayCount ? { day, rest: t.slice(num[0].length) } : null;
    }
    const named = t.match(/^\*\*([^*]+)\*\*[\s:—–-]*/);
    if (!named) return null;
    const day = names.indexOf(leadKey(named[1]));
    return day >= 0 && day < dayCount && names[day] ? { day, rest: t.slice(named[0].length) } : null;
  };
  const push = (day: number, rest: string) => days[day].push(rest.charAt(0).toUpperCase() + rest.slice(1));
  for (const block of text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)) {
    const whole = route(block);
    if (whole) {
      push(whole.day, whole.rest);
      continue;
    }
    // Per-session bullets ("- **Lower — squat focus (Mon):** …") split out of a list block.
    const kept: string[] = [];
    for (const line of block.split("\n")) {
      const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      const hit = bullet ? route(bullet[1].trim()) : null;
      if (hit) push(hit.day, hit.rest);
      else kept.push(line);
    }
    const left = kept.join("\n").trim();
    if (left) general.push(left);
  }
  return { days, general };
}

// ---- history ----

export interface HistoryEntry {
  version: number;
  generation: GenerationDto;
  /** The trainer's words, or null for the first draft. */
  request: string | null;
  manual: boolean;
}

/** One entry per version in the chain (oldest first). */
export function historyEntries(chain: GenerationDto[]): HistoryEntry[] {
  return chain.map((g, i) => ({
    version: i + 1,
    generation: g,
    request: i === 0 ? null : g.revisionMessage?.trim() || null,
    manual: g.manualEdit === true,
  }));
}

/** "14 min ago" / "4 h ago" / "2 d ago" relative to `now`. */
export function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}
