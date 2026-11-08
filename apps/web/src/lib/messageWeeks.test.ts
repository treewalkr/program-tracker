import { expect, test } from "bun:test";
import type { SignalLog, SignalProgram } from "@pt/shared";
import { loggedBlockWeeks } from "./messageWeeks";

const program: SignalProgram = {
  id: "p1",
  clientId: "c1",
  name: "Block",
  status: "active",
  weeks: [],
  activatedAt: "2026-10-12T03:15:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
};
const log = (date: string, programId = "p1"): SignalLog => ({ programId, date, sets: [] });

test("full ISO timestamps (Eden-revived dates) map to block weeks, not NaN", () => {
  const weeks = loggedBlockWeeks(program, [
    log("2026-10-12T00:00:00.000Z"),
    log("2026-10-20T00:00:00.000Z"),
    log("2026-10-21T00:00:00.000Z"),
  ]);
  expect(weeks).toEqual([1, 2]);
});

test("plain YYYY-MM-DD dates work too, sorted ascending", () => {
  expect(loggedBlockWeeks(program, [log("2026-11-02"), log("2026-10-13")])).toEqual([1, 4]);
});

test("skips other programs and unparseable dates; backfilled logs before activation count (F05)", () => {
  const weeks = loggedBlockWeeks(program, [
    log("2026-10-14", "other"),
    log("2026-10-05"),
    log("garbage"),
    log("2026-10-14"),
  ]);
  // The block anchors on the earlier 2026-10-05 log, so 10-14 is week 2.
  expect(weeks).toEqual([1, 2]);
  expect(weeks.every(Number.isFinite)).toBe(true);
});
