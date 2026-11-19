import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

describe("mockApi clientsOverview", () => {
  test("one row per client clients() lists, matching client(), sessionLogs() and clientPortal()", async () => {
    const rows = await mockApi.clientsOverview();
    const listed = await mockApi.clients();
    expect(rows.map((r) => r.client)).toEqual(listed);
    for (const row of rows) {
      const id = row.client.id;
      const [detail, logs, portal] = await Promise.all([
        mockApi.client(id),
        mockApi.sessionLogs(id),
        mockApi.clientPortal(id),
      ]);
      expect(row.currentProgram).toEqual(detail.currentProgram);
      expect(row.logs).toEqual(logs);
      expect(row.portalLink).toBe(portal.link);
    }
    // the seed has at least one client training, one with logs and one with the portal on
    expect(rows.some((r) => r.currentProgram)).toBe(true);
    expect(rows.some((r) => r.logs.length > 0)).toBe(true);
    expect(rows.some((r) => r.portalLink)).toBe(true);
  });

  test("turning a portal on gives that client a link; off, null again", async () => {
    const row = (await mockApi.clientsOverview()).find((r) => !r.portalLink)!;
    const link = (await mockApi.enableClientPortal(row.client.id)).link;
    const on = (await mockApi.clientsOverview()).find((r) => r.client.id === row.client.id);
    expect(on?.portalLink).toBe(link);
    await mockApi.disableClientPortal(row.client.id);
    const off = (await mockApi.clientsOverview()).find((r) => r.client.id === row.client.id);
    expect(off?.portalLink).toBeNull();
  });
});
