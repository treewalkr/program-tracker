import { expect, test } from "bun:test";
import type { SignalLog, SignalProgram } from "@pt/shared";
import { loggedBlockWeeks, switchDraftWeek } from "./messageWeeks";

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

type Msg = { id: string; status: string };
const m = (id: string, status = "validated"): Msg => ({ id, status });

test("switching week parks an open draft with its edits and restores it on return", () => {
  const away = switchDraftWeek<Msg>({}, 5, { msg: m("d5"), text: "edited" }, 4);
  expect(away.open).toBeNull();
  expect(away.parked).toEqual({ 5: { msg: m("d5"), text: "edited" } });
  const back = switchDraftWeek(away.parked, 4, null, 5);
  expect(back.open).toEqual({ msg: m("d5"), text: "edited" });
  expect(back.parked).toEqual({});
});

test("approved or rejected messages aren't parked: they're in history already", () => {
  expect(switchDraftWeek<Msg>({}, 5, { msg: m("a", "approved"), text: "x" }, 4).parked).toEqual({});
  expect(switchDraftWeek<Msg>({}, 5, { msg: m("r", "rejected"), text: "x" }, 4).parked).toEqual({});
});

test("other weeks' parked drafts stay put", () => {
  const parked = { 2: { msg: m("d2"), text: "two" } };
  const r = switchDraftWeek<Msg>(parked, 5, { msg: m("d5"), text: "five" }, 4);
  expect(Object.keys(r.parked)).toEqual(["2", "5"]);
});
