import { describe, expect, test } from "bun:test";
import { filterClients, lastSessionLabel, programmeLabel, sampleAdminClientDetail, sampleAdminClients, shortDay, trainersOf } from "./adminClients";

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

describe("programmes", () => {
  test("most active clients have one; paused, archived and brand-new clients don't", () => {
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(rows.filter((r) => r.status !== "active").every((r) => r.programme === null)).toBe(true);
    expect(by.get("c-5")?.programme).toBeNull();
    const active = rows.filter((r) => r.status === "active");
    expect(active.filter((r) => r.programme).length).toBeGreaterThan(active.length / 2);
  });
  test("programmeLabel reads the block week, flagging overruns", () => {
    expect(programmeLabel({ week: 3, of: 8, over: false })).toBe("Wk 3 of 8");
    expect(programmeLabel({ week: 8, of: 8, over: true })).toBe("Wk 8 of 8 · over");
  });
});

describe("sampleAdminClientDetail", () => {
  test("unknown id → null", () => expect(sampleAdminClientDetail("nope", TODAY)).toBeNull());
  test("carries the row, basics and this week with exercise names", () => {
    const d = sampleAdminClientDetail("c-1", TODAY)!;
    expect(d.client).toMatchObject({ id: "c-1", name: "Dana Whitfield", trainer: { id: "t-alex" }, age: 34, trainingDays: [1, 3, 5] });
    expect(d.client).not.toHaveProperty("birthDate");
    expect(d.programme).toMatchObject({ name: "Strength Base A", week: 3, of: 6 });
    expect(d.programme!.thisWeek.week).toBe(3);
    const names = d.programme!.thisWeek.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseName));
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain("Back Squat");
    expect(names.every((n) => n && !n.startsWith("ex-"))).toBe(true);
  });
  test("an active client can have no programme", () => {
    expect(sampleAdminClientDetail("c-12", TODAY)?.programme).toBeNull();
  });
});
