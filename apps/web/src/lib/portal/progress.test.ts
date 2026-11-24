import { describe, expect, test } from "bun:test";
import type { PortalCardioLog } from "@pt/shared";
import { en, format, th, type MessageKey } from "./messages";
import { cardioSummary, hoursMinutes, logLine, reviewDay, trendAxis, trendPath, vo2Delta, vo2Shown, vo2Tone } from "./progress";
import { localDateOf } from "@pt/shared";

const tEn = (k: MessageKey, v?: Record<string, string | number>) => format(en[k], v);
const tTh = (k: MessageKey, v?: Record<string, string | number>) => format(th[k], v);

const log = (over: Partial<PortalCardioLog> = {}): PortalCardioLog => ({
  id: "l",
  date: "2026-11-21",
  modality: "Running",
  durationSec: 2110,
  distanceKm: 5.2,
  rpe: 7,
  load: 246,
  avgHr: 151,
  maxHr: 176,
  skipped: false,
  loggedBy: "client",
  trainerFeedback: null,
  reviewedAt: null,
  ...over,
});

describe("portal progress", () => {
  test("time adds up in hours and minutes", () => {
    expect(hoursMinutes(42, tEn)).toBe("42 min");
    expect(hoursMinutes(135, tTh)).toBe("2 ชม. 15 นาที");
    expect(hoursMinutes(180, tEn)).toBe("3 h");
  });

  test("VO₂max change is the newest test against the one before", () => {
    // +1.7 shows as +2 but isn't the 2 ml/kg/min real change, so no green badge
    const d = vo2Delta([{ value: 41.3 }, { value: 44.2 }, { value: 45.9 }])!;
    expect(d).toBe(1.7);
    expect(vo2Shown(d)).toBe(2);
    expect(vo2Tone(d)).toBe("neutral");
    expect(vo2Delta([{ value: 45.2 }, { value: 46.1 }])).toBe(0.9);
    expect(vo2Tone(vo2Delta([{ value: 44.2 }, { value: 46.2 }])!)).toBe("good");
    expect(vo2Tone(1)).toBe("neutral");
    expect(vo2Tone(2)).toBe("good");
    expect(vo2Tone(-3)).toBe("neutral");
    expect(trendAxis([{ value: 41.3 }, { value: 45.9 }])).toEqual({ top: 46, bottom: 41 });
    expect(vo2Delta([{ value: 45.9 }])).toBeNull();
  });

  test("the trend line runs by date, highest value at the top", () => {
    const { dots } = trendPath([{ testedOn: "2026-09-01", value: 40 }, { testedOn: "2026-11-01", value: 45 }], 260, 44);
    expect(dots[0].x).toBeLessThan(dots[1].x);
    expect(dots[1].y).toBeLessThan(dots[0].y);
  });

  test("a recent log reads time, then distance · RPE · average HR; a skip says so", () => {
    expect(logLine(log(), tEn)).toEqual({ time: "35:10", detail: "5.2 km · RPE 7 · avg 151 bpm" });
    expect(logLine(log({ skipped: true }), tTh).time).toBe("ไม่ได้เล่น");
  });

  test("a review shows on the member's own calendar day, not the UTC one", () => {
    const at = "2026-11-21T20:30:00.000Z";
    expect(reviewDay(at)).toBe(localDateOf(Date.parse(at)));
  });
});

describe("cardioSummary: sessions and time lead, the coach's load comes second", () => {
  const tEn = (k: MessageKey, v?: Record<string, string | number>) => format(en[k], v);
  test("a load target reads sessions and time first, then load without AU", () => {
    const s = cardioSummary({ unit: "session_load", target: 600, done: 246.4, sessions: 2, minutes: 75 }, tEn);
    expect(s).toEqual({ lead: "2 sessions · 1 h 15 min", second: "Load 246 of 600" });
    expect(s.second).not.toContain("AU");
  });
  test("a minutes or sessions target is already the lead", () => {
    expect(cardioSummary({ unit: "minutes", target: 120, done: 90, sessions: 2, minutes: 90 }, tEn)).toEqual({ lead: "90 of 120 min", second: null });
  });
});
