import {
  progressBlock,
  diffWeekSessions,
  plannedVolume,
  progressionLabel,
  sessionsInSeqOrder,
  type OneRepMaxes,
  type ProgramWeek,
  type ProgressionKind,
  type SlotChange,
} from "@pt/shared";
import type { ProgramPhasingDto, ProgramWeekDto, WeekDirective, WeekMetric, WeekPlan } from "./api/types";

export interface PhasingRow {
  directive: WeekDirective;
  metric: WeekMetric | "";
  deltaPercent: number | null;
  /** Progression rule vs the week before ("" / absent = none). */
  progKind?: ProgressionKind | "";
  progAmount?: number | null;
  /** Coach's note for the week ("" / absent = none). */
  note?: string;
}

/** A scheme's weeks as editable rows (WeekPlanRows.svelte). */
export function weekPlansToRows(weeks: readonly WeekPlan[]): PhasingRow[] {
  return weeks.map((w) => ({
    directive: w.directive,
    metric: w.target?.metric ?? "",
    deltaPercent: w.target?.deltaPercent ?? null,
    ...(w.progression ? { progKind: w.progression.kind, progAmount: w.progression.amount } : {}),
    ...(w.note ? { note: w.note } : {}),
  }));
}

/** Rows back to week plans, numbered from 1; blank targets, zero rules and empty notes drop out. */
export function rowsToWeekPlans(rows: readonly PhasingRow[]): WeekPlan[] {
  return rows.map((r, i) => {
    const plan: WeekPlan = { week: i + 1, directive: r.directive };
    const delta = r.deltaPercent == null ? NaN : Number(r.deltaPercent);
    if (r.metric !== "" && Number.isFinite(delta)) {
      plan.target = { metric: r.metric, deltaPercent: delta };
    }
    const amount = r.progAmount == null ? NaN : Number(r.progAmount);
    if (r.progKind && Number.isFinite(amount) && amount !== 0) {
      plan.progression = { kind: r.progKind, amount: r.progKind === "sets" ? Math.round(amount) : amount };
    }
    const note = r.note?.trim();
    if (note) plan.note = note.slice(0, 500);
    return plan;
  });
}

export function phasingToRows(p: ProgramPhasingDto | null): PhasingRow[] {
  if (!p?.weeks || p.weeks.length === 0) return [];
  return weekPlansToRows(p.weeks);
}

export function rowsToPhasing(
  rows: PhasingRow[],
  phase: string,
  nextPhase: string,
  weeksCount: number
): ProgramPhasingDto | null {
  const trimmedPhase = phase.trim();
  if (!trimmedPhase) return null;
  return {
    plannedWeeks: Math.max(rows.length, weeksCount),
    phase: trimmedPhase,
    nextPhase: nextPhase.trim() || null,
    weeks: rowsToWeekPlans(rows),
  };
}

export interface ProgressionPreviewRow {
  week: number;
  /** "+2.5 kg", or "copy of the week before" / "kept (deload)". */
  rule: string;
  /** The program has no week with this number yet. */
  isNew: boolean;
  /** Changes vs the saved week (empty for a new week). */
  changes: SlotChange[];
  /** Planned tonnage from resolved loads; null = no loads. */
  planned: number | null;
}

/** "Apply progression" preview: weeks 1…n generated from W1, and per week 2…n what changes. Pure. */
export function progressionPreview(
  weeks: ProgramWeekDto[],
  phasing: ProgramPhasingDto,
  maxes: OneRepMaxes | null | undefined
): { weeks: ProgramWeekDto[]; rows: ProgressionPreviewRow[] } {
  const { weeks: next, firstOfLetter } = progressBlock(weeks as ProgramWeek[], phasing);
  const rows = next.slice(1).map((w) => {
    const saved = weeks.find((x) => x.week === w.week);
    const plan = phasing.weeks?.find((p) => p.week === w.week);
    const rule = firstOfLetter.includes(w.week)
      ? `first ${w.rotation} week, kept`
      : plan?.progression
        ? progressionLabel(plan.progression)
        : plan?.directive === "deload" && saved
          ? "kept (deload)"
          : w.rotation
            ? `copy of the last ${w.rotation} week`
            : "copy of the week before";
    return {
      week: w.week,
      rule,
      isNew: !saved,
      changes: saved
        ? diffWeekSessions({ sessions: sessionsInSeqOrder(saved.sessions) }, { sessions: sessionsInSeqOrder(w.sessions) })
        : [],
      planned: plannedVolume(w.sessions, maxes),
    };
  });
  return { weeks: next, rows };
}
