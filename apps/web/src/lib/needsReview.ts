/**
 * The overview's Needs review panel, as pure data: the Check in / Plan ahead filter, and the merged "weeks end soon" row.
 * The page only renders what comes out of here.
 */
import type { SignalDto } from "$lib/api/types";
import type { SignalKind } from "@pt/shared";

export type ReviewGroup = "check" | "plan";
export type ReviewFilter = "all" | ReviewGroup;

/** Calendar work the trainer can plan ahead for; everything else is a check-in. */
export const PLAN_AHEAD_KINDS: ReadonlySet<SignalKind> = new Set<SignalKind>(["week-ending", "block-ending", "transition-due", "deload-week"]);

export const reviewGroup = (s: Pick<SignalDto, "kind">): ReviewGroup => (PLAN_AHEAD_KINDS.has(s.kind) ? "plan" : "check");

/** Signals per filter choice, over the Needs review signals. */
export function filterCounts(signals: SignalDto[]): Record<ReviewFilter, number> {
  const plan = signals.filter((s) => reviewGroup(s) === "plan").length;
  return { all: signals.length, check: signals.length - plan, plan };
}

/** The filter only earns its place when both groups have something. */
export const showFilter = (counts: Record<ReviewFilter, number>): boolean => counts.check > 0 && counts.plan > 0;

export type ReviewRow =
  | { type: "one"; key: string; signal: SignalDto }
  /** 2+ week-ending signals as one row; Hide snoozes every one of them. */
  | { type: "weeks"; key: string; title: string; signals: SignalDto[] };

/** The listed signals for `filter` (All when the filter is hidden), in order, with
 *  2+ week-ending signals merged into one row where the first of them stood. */
export function reviewRows(signals: SignalDto[], filter: ReviewFilter): ReviewRow[] {
  const effective = showFilter(filterCounts(signals)) ? filter : "all";
  const listed = signals.filter((s) => effective === "all" || reviewGroup(s) === effective);
  const weeks = listed.filter((s) => s.kind === "week-ending");
  const rows: ReviewRow[] = [];
  for (const s of listed) {
    if (s.kind === "week-ending" && weeks.length > 1) {
      if (s === weeks[0]) rows.push({ type: "weeks", key: "week-ending", title: `${weeks.length} weeks end soon — draft next week`, signals: weeks });
      continue;
    }
    rows.push({ type: "one", key: s.id, signal: s });
  }
  return rows;
}

/** How many signals the rows stand for (a merged row counts each of its weeks). */
export const rowSignalCount = (rows: ReviewRow[]): number => rows.reduce((n, r) => n + (r.type === "weeks" ? r.signals.length : 1), 0);

/** Every signal id behind a row — what its Hide snoozes. */
export const rowSignalIds = (row: ReviewRow): string[] => (row.type === "weeks" ? row.signals.map((s) => s.id) : [row.signal.id]);

/** The generate-flow link a week-ending (or any targetWeek) signal opens. */
export function generateWeekHref(s: Pick<SignalDto, "clientId" | "targetWeek" | "prefillNote">): string {
  return `/clients/${s.clientId}/generate?week=${s.targetWeek}${s.prefillNote ? `&note=${encodeURIComponent(s.prefillNote)}` : ""}`;
}
