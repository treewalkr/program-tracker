import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

describe("mockApi clientsOverview", () => {
  test("one row per member clients() lists, matching client(), sessionLogs() and clientPortal()", async () => {
    const rows = await mockApi.clientsOverview();
    const listed = await mockApi.clients();
    expect(rows.map((r) => r.client)).toEqual(listed);
    // every member at once: the mock sleeps on each call, and one by one ran close to the 5 s test limit on CI
    const checks = rows.map(async (row) => {
      const id = row.client.id;
      const [detail, logs, portal] = await Promise.all([
        mockApi.client(id),
        mockApi.sessionLogs(id),
        mockApi.clientPortal(id),
      ]);
      expect(row.currentProgram).toEqual(detail.currentProgram);
      // the overview's logs are the full ones cut to what the strips read
      expect(row.logs).toEqual(
        logs.map((l) => ({
          programId: l.programId,
          programSessionId: l.programSessionId,
          date: l.date,
          kind: l.kind,
          cardio: l.cardio,
          sets: l.sets.map((s) => ({ exerciseId: s.exerciseId, type: s.type, weightKg: s.weightKg, reps: s.reps })),
        }))
      );
      expect(row.portalLink).toBe(portal.link);
    });
    await Promise.all(checks);
    // the seed has at least one member training, one with logs and one with the portal on
    expect(rows.some((r) => r.currentProgram)).toBe(true);
    expect(rows.some((r) => r.logs.length > 0)).toBe(true);
    expect(rows.some((r) => r.portalLink)).toBe(true);
  });

  test("turning a portal on gives that member a link; off, null again", async () => {
    const row = (await mockApi.clientsOverview()).find((r) => !r.portalLink)!;
    const link = (await mockApi.enableClientPortal(row.client.id)).link;
    const on = (await mockApi.clientsOverview()).find((r) => r.client.id === row.client.id);
    expect(on?.portalLink).toBe(link);
    await mockApi.disableClientPortal(row.client.id);
    const off = (await mockApi.clientsOverview()).find((r) => r.client.id === row.client.id);
    expect(off?.portalLink).toBeNull();
  });
});
