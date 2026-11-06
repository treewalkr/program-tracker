import type { AiDraftDto, ExerciseDto, GenerationDto, ProgramPhasingDto } from "./api/types";

// ---- block plan ----

export type PlanWeek = NonNullable<ProgramPhasingDto["weeks"]>[number];

/** "+5% volume", "−40% volume", "+2.5% load"; "" without a target. */
export function weekTargetLabel(w: PlanWeek): string {
  if (!w.target) return "";
  const metric = { overall_volume: "volume", rep_volume: "rep volume", intensity: "load" }[w.target.metric];
  const sign = w.target.deltaPercent > 0 ? "+" : "";
  return `${sign}${w.target.deltaPercent}% ${metric}`;
}

/**
 * Volume and load index per week, chained from each week's % target (week 1 = 100).
 * Volume targets (overall/rep) move `vol`; intensity targets move `load`.
 */
export function planIndexes(ph: ProgramPhasingDto): { vol: number; load: number }[] {
  let vol = 100;
  let load = 100;
  return (ph.weeks ?? []).map((w) => {
    if (w.target && w.target.metric !== "intensity") vol *= 1 + w.target.deltaPercent / 100;
    if (w.target && w.target.metric === "intensity") load *= 1 + w.target.deltaPercent / 100;
    return { vol, load };
  });
}

export interface PlanChange {
  /** 1-based week, or null for phase-level changes. */
  week: number | null;
  where: string;
  from: string | null;
  to: string;
}

/** Plan edits from `a` to `b` (phase names, weeks added/removed, directive, target, note). */
export function planChanges(a: ProgramPhasingDto | null | undefined, b: ProgramPhasingDto | null | undefined): PlanChange[] {
  const out: PlanChange[] = [];
  if (!a && !b) return out;
  if (!a && b) return [{ week: null, where: "Block plan", from: null, to: `added · ${b.weeks?.length ?? b.plannedWeeks} weeks` }];
  if (a && !b) return [{ week: null, where: "Block plan", from: `${a.weeks?.length ?? a.plannedWeeks} weeks`, to: "removed" }];
  const x = a!;
  const y = b!;
  if (x.phase !== y.phase) out.push({ week: null, where: "Phase", from: x.phase, to: y.phase });
  if ((x.nextPhase ?? "") !== (y.nextPhase ?? "")) out.push({ week: null, where: "Next block", from: x.nextPhase || "—", to: y.nextPhase || "—" });
  const xw = x.weeks ?? [];
  const yw = y.weeks ?? [];
  const n = Math.max(xw.length, yw.length);
  for (let i = 0; i < n; i++) {
    const p = xw[i];
    const q = yw[i];
    const week = i + 1;
    if (!p && q) {
      out.push({ week, where: `W${week}`, from: null, to: `added · ${q.directive}${q.target ? ` · ${weekTargetLabel(q)}` : ""}` });
      continue;
    }
    if (p && !q) {
      out.push({ week, where: `W${week}`, from: `${p.directive}${p.target ? ` · ${weekTargetLabel(p)}` : ""}`, to: "removed" });
      continue;
    }
    if (p.directive !== q.directive) out.push({ week, where: `W${week}`, from: p.directive, to: q.directive });
    if (weekTargetLabel(p) !== weekTargetLabel(q)) {
      out.push({ week, where: `W${week} target`, from: weekTargetLabel(p) || "no target", to: weekTargetLabel(q) || "no target" });
    }
    if ((p.note ?? "") !== (q.note ?? "")) out.push({ week, where: `W${week} note`, from: null, to: "edited" });
  }
  return out;
}

/** Inline guidance for one week: "err" blocks saving, "warn" does not. */
export function validatePlanWeek(w: PlanWeek): { kind: "err" | "warn"; text: string } | null {
  if (w.target && (!Number.isFinite(w.target.deltaPercent) || w.target.deltaPercent < -100 || w.target.deltaPercent > 200)) {
    return { kind: "err", text: "Target must be between −100% and +200%." };
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

/** Starting plan when a draft has none: base → +volume … → deload. */
export function defaultPlan(weeks = 4): ProgramPhasingDto {
  return normalizePlan({
    phase: "accumulation",
    nextPhase: null,
    plannedWeeks: weeks,
    weeks: Array.from({ length: weeks }, (_, i) =>
      i === 0
        ? { week: 1, directive: "base" as const }
        : i === weeks - 1
          ? { week: i + 1, directive: "deload" as const, target: { metric: "overall_volume" as const, deltaPercent: -40 } }
          : { week: i + 1, directive: "+volume" as const, target: { metric: "overall_volume" as const, deltaPercent: 5 } }
    ),
  });
}

// ---- checks ----

export interface ReviewCheck {
  /** ok = meets the client's setup · warn = worth a look · info = plain fact, no judgement. */
  tone: "ok" | "warn" | "info";
  text: string;
}

/** Facts a trainer checks before approving, computed from the draft and catalog. */
export function reviewChecks(
  draft: AiDraftDto,
  sessionsPerWeek: number | null,
  catalogById: ReadonlyMap<string, Pick<ExerciseDto, "movementPattern">>
): ReviewCheck[] {
  const sets = { push: 0, pull: 0, knee: 0, hip: 0 };
  let total = 0;
  let maxRpe = 0;
  for (const s of draft.sessions) {
    for (const e of s.exercises) {
      const n = e.prescribedSets.length;
      total += n;
      for (const ps of e.prescribedSets) if (ps.targetRpe != null) maxRpe = Math.max(maxRpe, ps.targetRpe);
      const p = e.exerciseId ? catalogById.get(e.exerciseId)?.movementPattern : null;
      if (p === "vertical_push" || p === "horizontal_push") sets.push += n;
      else if (p === "vertical_pull" || p === "horizontal_pull") sets.pull += n;
      else if (p === "knee_dominant") sets.knee += n;
      else if (p === "hip_dominant") sets.hip += n;
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
  return out;
}

// ---- tracks ----

/** Track label per draft session in draft order: "Session 1", "Session 2", "Cardio 1"… */
export function draftSessionTags(sessions: readonly { kind?: string | null }[]): string[] {
  const n = { lifting: 0, cardio: 0 };
  return sessions.map((s) => (s.kind === "cardio" ? `Cardio ${++n.cardio}` : `Session ${++n.lifting}`));
}

// ---- rationale ----

/**
 * Rationale split into markdown blocks: those opening with a bold "Session N" /
 * "Cardio N" lead (or legacy "Day N" = Nth session in draft order) go to that
 * session (lead removed, first letter capitalised); the rest are general.
 * Pass `kinds` (draft session kinds) to resolve track leads; without it every
 * lead counts as a draft position.
 */
export function rationaleByDay(
  text: string,
  dayCount: number,
  kinds?: readonly (string | null | undefined)[]
): { days: string[][]; general: string[] } {
  const days: string[][] = Array.from({ length: dayCount }, () => []);
  const general: string[] = [];
  const indexOf = (lead: string, n: number): number => {
    if (lead === "Day" || !kinds) return n - 1;
    const want = lead === "Cardio" ? "cardio" : "lifting";
    let seen = 0;
    for (let i = 0; i < kinds.length; i++) {
      if ((kinds[i] === "cardio" ? "cardio" : "lifting") === want && ++seen === n) return i;
    }
    return -1;
  };
  for (const block of text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)) {
    const m = block.match(/^\*\*(Day|Session|Cardio) (\d+)\b[^*]*\*\*[\s:—-]*/);
    const day = m ? indexOf(m[1], Number(m[2])) : -1;
    if (m && day >= 0 && day < dayCount) {
      const rest = block.slice(m[0].length);
      days[day].push(rest.charAt(0).toUpperCase() + rest.slice(1));
    } else {
      general.push(block);
    }
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
