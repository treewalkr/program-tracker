import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

describe("mockApi roster (mirrors /v1/clients/roster)", () => {
  test("pages every client with counts; archived included", async () => {
    const all = await mockApi.clients();
    const page = await mockApi.roster({});
    expect(page.page).toBe(1);
    expect(page.limit).toBe(10);
    expect(page.counts.all).toBe(page.total);
    expect(page.counts.active + page.counts.paused + page.counts.archived).toBe(page.total);
    expect(page.total).toBeGreaterThanOrEqual(all.length);
  });

  test("status filters rows but not counts; q narrows both", async () => {
    const all = await mockApi.roster({});
    const paused = await mockApi.roster({ status: "paused" });
    expect(paused.items.every((c) => c.status === "paused")).toBe(true);
    expect(paused.counts).toEqual(all.counts);
    const first = all.items[0];
    const found = await mockApi.roster({ q: first.name.toUpperCase() });
    expect(found.items.map((c) => c.id)).toContain(first.id);
    expect(found.counts.all).toBeLessThanOrEqual(all.counts.all);
  });

  test("name sort puts actives first; a page past the end clamps", async () => {
    const { items } = await mockApi.roster({ limit: 50 });
    const rank = { active: 0, paused: 1, archived: 2 };
    expect(items.map((c) => rank[c.status])).toEqual([...items.map((c) => rank[c.status])].sort());
    const last = await mockApi.roster({ page: 99 });
    expect(last.page).toBe(Math.max(1, Math.ceil(last.total / 10)));
  });

  test("rows carry program week and last session; limit outside 10/25/50 is refused", async () => {
    const { items } = await mockApi.roster({ sort: "last", limit: 50 });
    const withProgram = items.find((c) => c.program);
    expect(withProgram?.program?.week).toBeGreaterThanOrEqual(1);
    expect(items[0].lastSessionAt).not.toBeNull();
    expect(mockApi.roster({ limit: 20 })).rejects.toThrow();
  });
});
