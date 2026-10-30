import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

const isoWeekday = () => (new Date().getDay() + 6) % 7 + 1; // 1=Mon … 7=Sun

describe("mockApi cardio", () => {
  test("clients() exposes cl-nat's seeded cardio target", async () => {
    const clients = await mockApi.clients();
    const nat = clients.find((c) => c.id === "cl-nat");
    expect(nat?.cardioTarget).toEqual({ unit: "minutes", value: 180 });
  });

  // runs before the logSession test — only the seeded 35-min run counts
  test("notifications surfaces cardio-behind for a behind client", async () => {
    const feed = await mockApi.notifications();
    const find = () => feed.find((s) => s.id === "cardio-behind:cl-nat");
    // cl-nat: target 180 min, seeded 35-min run this week. Pro-rata thresholds
    // Thu=62 … Sun=108 — 35 min is short of pace every day it can fire.
    if (isoWeekday() >= 4) {
      expect(find()).toBeDefined();
      expect(find()!.kind).toBe("cardio-behind");
      expect(find()!.title).toBe("Cardio behind weekly target");
      expect(find()!.altHref).toBe("/clients/cl-nat");
    } else {
      expect(find()).toBeUndefined();
    }
  });

  test("logSession stores a cardio log; sessionLogs returns kind and cardio", async () => {
    const before = await mockApi.sessionLogs("cl-nat");
    expect(before.some((l) => l.kind === "cardio" && l.cardio?.durationMin === 35)).toBe(true);
    expect(before.every((l) => l.kind === "lifting" || l.kind === "cardio")).toBe(true);

    await mockApi.logSession({
      clientId: "cl-nat",
      programId: "pg-nat-a",
      date: new Date().toISOString().slice(0, 10),
      kind: "cardio",
      cardio: { modality: "Bike", durationMin: 45, hrZone: 2 },
      sets: [],
    });

    const after = await mockApi.sessionLogs("cl-nat");
    const logged = after.find((l) => l.cardio?.modality === "Bike");
    expect(logged).toBeDefined();
    expect(logged!.kind).toBe("cardio");
    expect(logged!.cardio).toEqual({ modality: "Bike", durationMin: 45, hrZone: 2 });
    expect(logged!.sets).toEqual([]);
  });
});
