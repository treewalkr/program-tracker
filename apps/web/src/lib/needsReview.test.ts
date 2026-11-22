import { describe, expect, test } from "bun:test";
import type { SignalDto } from "$lib/api/types";
import { filterCounts, generateWeekHref, reviewGroup, reviewRows, rowSignalCount, rowSignalIds, showFilter } from "./needsReview";

const sig = (id: string, kind: SignalDto["kind"], extra: Partial<SignalDto> = {}): SignalDto =>
  ({ id, kind, severity: "info", title: id, evidence: "", programId: "p", clientId: `c-${id}`, ...extra }) as SignalDto;

const feed = [
  sig("adh", "adherence", { severity: "attention" }),
  sig("wk1", "week-ending", { targetWeek: 3 }),
  sig("pain", "pain-flag", { severity: "attention" }),
  sig("wk2", "week-ending", { targetWeek: 5 }),
  sig("deload", "deload-week"),
];

describe("groups", () => {
  test("calendar kinds plan ahead, the rest are check-ins", () => {
    expect(["week-ending", "block-ending", "transition-due", "deload-week"].map((k) => reviewGroup({ kind: k as SignalDto["kind"] }))).toEqual(["plan", "plan", "plan", "plan"]);
    expect(["adherence", "pain-flag", "stall", "cardio-behind"].map((k) => reviewGroup({ kind: k as SignalDto["kind"] }))).toEqual(["check", "check", "check", "check"]);
  });

  test("counts per filter, and the filter only shows when both groups have signals", () => {
    expect(filterCounts(feed)).toEqual({ all: 5, check: 2, plan: 3 });
    expect(showFilter(filterCounts(feed))).toBe(true);
    expect(showFilter(filterCounts(feed.filter((s) => reviewGroup(s) === "plan")))).toBe(false);
    expect(showFilter(filterCounts([]))).toBe(false);
  });
});

describe("rows", () => {
  test("2+ week-ending signals merge into one row where the first stood", () => {
    const rows = reviewRows(feed, "all");
    expect(rows.map((r) => r.key)).toEqual(["adh", "week-ending", "pain", "deload"]);
    const merged = rows[1];
    expect(merged.type).toBe("weeks");
    if (merged.type !== "weeks") return;
    expect(merged.title).toBe("2 weeks end soon — draft next week");
    expect(rowSignalIds(merged)).toEqual(["wk1", "wk2"]);
    expect(rowSignalCount(rows)).toBe(5);
  });

  test("a single week-ending signal stays a normal row", () => {
    const rows = reviewRows(feed.filter((s) => s.id !== "wk2"), "all");
    expect(rows.map((r) => r.type)).toEqual(["one", "one", "one", "one"]);
    expect(rowSignalIds(rows[1])).toEqual(["wk1"]);
  });

  test("filters by group", () => {
    expect(reviewRows(feed, "check").map((r) => r.key)).toEqual(["adh", "pain"]);
    expect(reviewRows(feed, "plan").map((r) => r.key)).toEqual(["week-ending", "deload"]);
    expect(rowSignalCount(reviewRows(feed, "plan"))).toBe(3);
  });

  test("a stale filter falls back to All once only one group is left", () => {
    const planOnly = feed.filter((s) => reviewGroup(s) === "plan");
    expect(reviewRows(planOnly, "check").map((r) => r.key)).toEqual(["week-ending", "deload"]);
  });
});

test("generate link carries the week and the encoded note", () => {
  expect(generateWeekHref({ clientId: "c1", targetWeek: 3, prefillNote: "Re-draft week 3 & go" })).toBe(
    "/clients/c1/generate?week=3&note=Re-draft%20week%203%20%26%20go"
  );
  expect(generateWeekHref({ clientId: "c1", targetWeek: 3 })).toBe("/clients/c1/generate?week=3");
});
