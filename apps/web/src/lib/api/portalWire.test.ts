import { describe, expect, test } from "bun:test";
import { portalWire } from "./portalWire";

describe("portalWire", () => {
  test("Eden-revived day fields come back as YYYY-MM-DD, timestamps as full ISO, strings untouched", () => {
    const revived = {
      currentWeek: 1,
      weeks: [
        {
          startDate: new Date("2026-11-10"),
          endDate: new Date("2026-11-16"),
          sessions: [{ id: "s1", log: { id: "l1", loggedBy: "client", date: new Date("2026-11-16") } }],
        },
      ],
      createdAt: new Date("2026-11-16T09:30:00.000Z"),
      name: "Lower A",
    };
    expect(portalWire(revived)).toEqual({
      currentWeek: 1,
      weeks: [{ startDate: "2026-11-10", endDate: "2026-11-16", sessions: [{ id: "s1", log: { id: "l1", loggedBy: "client", date: "2026-11-16" } }] }],
      createdAt: "2026-11-16T09:30:00.000Z",
      name: "Lower A",
    });
  });
});

describe("portalWire reads the session kind alias", () => {
  test("a release-2 week (kind exercises) reads as lifting; flags keep their kinds", () => {
    const week = {
      weeks: [
        {
          sessions: [
            { id: "s1", kind: "exercises", log: { id: "l", date: new Date("2026-11-16"), entry: { kind: "exercises", flags: [{ kind: "pain" }] } } },
            { id: "c1", kind: "cardio", log: null },
          ],
        },
      ],
    };
    expect(portalWire(week)).toEqual({
      weeks: [
        {
          sessions: [
            { id: "s1", kind: "lifting", log: { id: "l", date: "2026-11-16", entry: { kind: "lifting", flags: [{ kind: "pain" }] } } },
            { id: "c1", kind: "cardio", log: null },
          ],
        },
      ],
    });
  });
});
