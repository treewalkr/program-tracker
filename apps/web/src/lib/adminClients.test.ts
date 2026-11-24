import { describe, expect, test } from "bun:test";
import { bookCell, booksOf, filterClients, lastSessionLabel, programmeLabel, sampleAdminClientDetail, sampleAdminClients, trainersOf } from "./adminClients";
import { shortDay } from "./dates";

const TODAY = "2026-11-09";
const rows = await sampleAdminClients(TODAY);
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
  test("unknown id → null", async () => expect(await sampleAdminClientDetail("nope", TODAY)).toBeNull());
  test("carries the row, basics and this week with exercise names", async () => {
    const d = (await sampleAdminClientDetail("c-1", TODAY))!;
    expect(d.client).toMatchObject({ id: "c-1", name: "Dana Whitfield", trainer: { id: "t-alex" }, age: 34, trainingDays: [1, 3, 5] });
    expect(d.client).not.toHaveProperty("birthDate");
    expect(d.programme).toMatchObject({ name: "Strength Base A", week: 3, of: 6 });
    expect(d.programme!.thisWeek.week).toBe(3);
    const names = d.programme!.thisWeek.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseName));
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain("Back Squat");
    expect(names.every((n) => n && !n.startsWith("ex-"))).toBe(true);
  });
  test("an active client can have no programme", async () => {
    expect((await sampleAdminClientDetail("c-12", TODAY))?.programme).toBeNull();
  });
});

describe("booksOf", () => {
  const books = booksOf(rows, TODAY);
  test("one book per trainer, in first-seen order, holding every client", () => {
    expect(books.map((b) => b.trainer.id)).toEqual(["t-alex", "t-june", "t-sam"]);
    expect(books.reduce((n, b) => n + b.clients.length, 0)).toBe(rows.length);
  });
  test("counts status, quiet, never and over plan", () => {
    const alex = books[0];
    expect(alex.status).toEqual({ active: 4, paused: 1, archived: 0 });
    expect(alex.never).toBe(1); // Ben Kowalski
    expect(alex.quiet).toBe(0);
    const june = books[1];
    expect(june.quiet).toBe(1); // Tom Becker, 18 days
    expect(june.over).toBe(1); // Lena Fischer
  });
  test("strip runs recent → fading → quiet → never → off, newest first within a kind", () => {
    const cells = books[0].strip.map((s) => s.cell);
    expect(cells).toEqual(["recent", "recent", "recent", "never", "off"]);
    expect(books[0].strip[0].client.name).toBe("Maya Chen"); // logged today
  });
});

describe("bookCell", () => {
  const c = rows[0];
  test("active clients by days since last session", () => {
    expect(bookCell({ ...c, lastSessionAt: "2026-11-02" }, TODAY)).toBe("recent");
    expect(bookCell({ ...c, lastSessionAt: "2026-11-01" }, TODAY)).toBe("fading");
    expect(bookCell({ ...c, lastSessionAt: "2026-10-26" }, TODAY)).toBe("fading");
    expect(bookCell({ ...c, lastSessionAt: "2026-10-25" }, TODAY)).toBe("quiet");
    expect(bookCell({ ...c, lastSessionAt: null }, TODAY)).toBe("never");
  });
  test("paused and archived are off whatever they logged", () => {
    expect(bookCell({ ...c, status: "paused" }, TODAY)).toBe("off");
  });
});
