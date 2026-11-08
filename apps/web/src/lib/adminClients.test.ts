import { describe, expect, test } from "bun:test";
import { filterClients, lastSessionLabel, sampleAdminClients, shortDay, trainersOf } from "./adminClients";

const TODAY = "2026-11-09";
const rows = sampleAdminClients(TODAY);
const all = { q: "", trainerId: "", status: "" as const };

describe("filterClients", () => {
  test("no filter keeps every row", () => {
    expect(filterClients(rows, all)).toHaveLength(rows.length);
  });
  test("search matches client or trainer name, any case", () => {
    expect(filterClients(rows, { ...all, q: "maya" }).map((r) => r.name)).toEqual(["Maya Chen"]);
    expect(filterClients(rows, { ...all, q: "JUNE" }).every((r) => r.trainer.name === "June Park")).toBe(true);
  });
  test("trainer and status combine", () => {
    const got = filterClients(rows, { ...all, trainerId: "t-sam", status: "paused" });
    expect(got.map((r) => r.name)).toEqual(["Felix Moreau"]);
  });
});

test("trainersOf lists each trainer once, in row order", () => {
  expect(trainersOf(rows).map((t) => t.id)).toEqual(["t-alex", "t-june", "t-sam"]);
});

describe("lastSessionLabel", () => {
  test("never logged", () => expect(lastSessionLabel(null, TODAY)).toEqual({ text: "Never", tone: "none" }));
  test("today and yesterday", () => {
    expect(lastSessionLabel(TODAY, TODAY).text).toBe("Today");
    expect(lastSessionLabel("2026-11-08", TODAY).text).toBe("Yesterday");
  });
  test("dormant after 14 days", () => {
    expect(lastSessionLabel("2026-10-26", TODAY)).toEqual({ text: "14 days ago", tone: "recent" });
    expect(lastSessionLabel("2026-10-25", TODAY)).toEqual({ text: "15 days ago", tone: "dormant" });
  });
  test("a month or more shows the date", () => {
    expect(lastSessionLabel("2026-03-12", TODAY)).toEqual({ text: "12 Mar", tone: "dormant" });
  });
});

test("shortDay adds the year outside the current one", () => {
  expect(shortDay("2025-03-12", TODAY)).toBe("12 Mar 2025");
});
