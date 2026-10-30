import type { ProgramPhasingDto, WeekDirective, WeekMetric, WeekPlan } from "./api/types";

export interface PhasingRow {
  directive: WeekDirective;
  metric: WeekMetric | "";
  deltaPercent: number | null;
}

export function phasingToRows(p: ProgramPhasingDto | null): PhasingRow[] {
  if (!p?.weeks || p.weeks.length === 0) return [];
  return p.weeks.map((w) => ({
    directive: w.directive,
    metric: w.target?.metric ?? "",
    deltaPercent: w.target?.deltaPercent ?? null,
  }));
}

export function rowsToPhasing(
  rows: PhasingRow[],
  phase: string,
  nextPhase: string,
  weeksCount: number
): ProgramPhasingDto | null {
  const trimmedPhase = phase.trim();
  if (!trimmedPhase) return null;

  const plannedWeeks = Math.max(rows.length, weeksCount);
  const weeks: WeekPlan[] = rows.map((r, i) => {
    const plan: WeekPlan = {
      week: i + 1,
      directive: r.directive,
    };
    if (r.metric !== "" && r.deltaPercent != null) {
      plan.target = {
        metric: r.metric,
        deltaPercent: r.deltaPercent,
      };
    }
    return plan;
  });

  return {
    plannedWeeks,
    phase: trimmedPhase,
    nextPhase: nextPhase.trim() || null,
    weeks,
  };
}
