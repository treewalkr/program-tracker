import { describe, expect, test } from "bun:test";
import { addDays, dayDates, defaultWeekStarts, isoWeekday, weekdayFromLabel } from "./importHistory";

const days = (...labels: string[]) => labels.map((label) => ({ label }));

describe("weekdayFromLabel", () => {
  test("English full and short names, any case", () => {
    expect(weekdayFromLabel("Mon - Upper A")).toBe(1);
    expect(weekdayFromLabel("Tuesday lower")).toBe(2);
    expect(weekdayFromLabel("TUES: legs")).toBe(2);
    expect(weekdayFromLabel("wed")).toBe(3);
    expect(weekdayFromLabel("Thurs pull")).toBe(4);
    expect(weekdayFromLabel("Friday")).toBe(5);
    expect(weekdayFromLabel("Sat (long run)")).toBe(6);
    expect(weekdayFromLabel("sunday")).toBe(7);
  });

  test("whole words only", () => {
    expect(weekdayFromLabel("Day 1 Back/Biceps")).toBeNull();
    expect(weekdayFromLabel("Monster day")).toBeNull();
    expect(weekdayFromLabel("Wedge drills")).toBeNull();
    expect(weekdayFromLabel("Saturation")).toBeNull();
  });

  test("Thai names, short Thursday too", () => {
    expect(weekdayFromLabel("วันจันทร์ ช่วงบน")).toBe(1);
    expect(weekdayFromLabel("อังคาร")).toBe(2);
    expect(weekdayFromLabel("วันพุธ")).toBe(3);
    expect(weekdayFromLabel("พฤหัส ขา")).toBe(4);
    expect(weekdayFromLabel("วันพฤหัสบดี")).toBe(4);
    expect(weekdayFromLabel("ศุกร์")).toBe(5);
    expect(weekdayFromLabel("เสาร์")).toBe(6);
    expect(weekdayFromLabel("วันอาทิตย์")).toBe(7);
  });

  test("อาทิตย์ meaning a week is not Sunday", () => {
    expect(weekdayFromLabel("อาทิตย์ที่ 2")).toBeNull();
  });

  test("the first name written wins", () => {
    expect(weekdayFromLabel("Fri (moved from Mon)")).toBe(5);
  });
});

describe("dates", () => {
  test("addDays and isoWeekday", () => {
    expect(addDays("2026-10-27", 7)).toBe("2026-11-03");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(isoWeekday("2026-11-02")).toBe(1);
    expect(isoWeekday("2026-11-08")).toBe(7);
  });

  test("defaultWeekStarts counts back a week at a time", () => {
    expect(defaultWeekStarts(3, "2026-11-02")).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(defaultWeekStarts(1, "2026-11-02")).toEqual(["2026-11-02"]);
    expect(defaultWeekStarts(0, "2026-11-02")).toEqual([]);
  });
});

describe("dayDates", () => {
  const MON = "2026-10-26";
  const WED = "2026-10-28";

  test("Day N goes on the Nth training day", () => {
    expect(dayDates(MON, days("Day 1", "Day 2", "Day 3"), [1, 3, 5])).toEqual(["2026-10-26", "2026-10-28", "2026-10-30"]);
  });

  test("training days are counted from the start's weekday", () => {
    // starts Wed; training Mon/Wed/Fri → Wed, Fri, next Mon
    expect(dayDates(WED, days("Day 1", "Day 2", "Day 3"), [5, 1, 3])).toEqual(["2026-10-28", "2026-10-30", "2026-11-02"]);
  });

  test("no training days → consecutive days", () => {
    expect(dayDates(MON, days("Day 1", "Day 2", "Day 3"), [])).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(dayDates(MON, days("Day 1", "Day 2"), null)).toEqual(["2026-10-26", "2026-10-27"]);
  });

  test("more days than training days → consecutive days", () => {
    expect(dayDates(MON, days("A", "B", "C"), [1, 4])).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
  });

  test("a weekday in the label wins", () => {
    expect(dayDates(MON, days("Mon - Upper A", "Thu - Lower", "Sat - Upper B"), [1, 2, 3])).toEqual([
      "2026-10-26",
      "2026-10-29",
      "2026-10-31",
    ]);
    // a named day before the start's weekday lands later in the week
    expect(dayDates(WED, days("Mon"), null)).toEqual(["2026-11-02"]);
  });

  test("labeled and unlabeled days mix", () => {
    expect(dayDates(MON, days("Day 1", "Fri - Legs", "Day 3"), [1, 3])).toEqual(["2026-10-26", "2026-10-30", "2026-10-28"]);
  });

  test("never past start + 6", () => {
    const eight = days("1", "2", "3", "4", "5", "6", "7", "8");
    expect(dayDates(MON, eight, null).at(-1)).toBe("2026-11-01");
  });
});
