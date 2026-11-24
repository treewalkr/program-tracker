import { chainSetCounts, type ChainCatalogEntry } from "@pt/shared";
import type { ChainWeekDto } from "./api/types";

export interface ChainPanelView {
  /** Which calendar week the counts are for. */
  week: "this" | "last";
  /** That week's Monday, date-only. */
  weekStart: string;
  chains: ChainWeekDto["chains"];
}

/** The Monday before `weekStart` (date-only, calendar arithmetic in UTC so no DST shift). */
function weekBefore(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/**
 * The member page's chain panel. Early in a week nothing is logged yet, so an
 * empty week so far shows last week's sets instead (counted from the logs the
 * page already has), unless last week was empty too.
 */
export function chainPanel(
  cw: ChainWeekDto,
  logs: { date: string; sets: { exerciseId: string; type: string }[] }[],
  catalog: ChainCatalogEntry[],
): ChainPanelView {
  const thisWeek: ChainPanelView = { week: "this", weekStart: cw.weekStart, chains: cw.chains };
  if (cw.chains.some((c) => c.sets > 0)) return thisWeek;
  const lastStart = weekBefore(cw.weekStart);
  const lastLogs = logs.filter((l) => l.date >= lastStart && l.date < cw.weekStart);
  const counts = chainSetCounts(cw.chains, lastLogs, catalog, lastStart);
  if (!cw.chains.some((c) => (counts[c.id] ?? 0) > 0)) return thisWeek;
  return { week: "last", weekStart: lastStart, chains: cw.chains.map((c) => ({ ...c, sets: counts[c.id] ?? 0 })) };
}
