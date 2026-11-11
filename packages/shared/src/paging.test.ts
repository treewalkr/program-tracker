import { describe, expect, test } from "bun:test";
import { DEFAULT_PAGE_LIMIT, PAGE_LIMITS, clampPage, isPageLimit, pageCount, pageOf, pageRange } from "./paging";

describe("paging", () => {
  test("limits and default", () => {
    expect([...PAGE_LIMITS]).toEqual([10, 25, 50]);
    expect(DEFAULT_PAGE_LIMIT).toBe(10);
    expect(isPageLimit(25)).toBe(true);
    expect(isPageLimit(20)).toBe(false);
  });

  test("page count never drops below 1", () => {
    expect(pageCount(10, 0)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
    expect(pageCount(10, 11)).toBe(2);
    expect(pageCount(25, 19)).toBe(1);
  });

  test("range of a middle, last and only page", () => {
    expect(pageRange(1, 10, 19)).toEqual({ page: 1, from: 1, to: 10, pages: 2 });
    expect(pageRange(2, 10, 19)).toEqual({ page: 2, from: 11, to: 19, pages: 2 });
    expect(pageRange(1, 25, 19)).toEqual({ page: 1, from: 1, to: 19, pages: 1 });
  });

  test("an empty list is page 1 of 1 showing nothing", () => {
    expect(pageRange(3, 10, 0)).toEqual({ page: 1, from: 0, to: 0, pages: 1 });
  });

  test("a page past the end clamps to the last; below 1 or junk clamps to 1", () => {
    expect(clampPage(9, 10, 19)).toBe(2);
    expect(pageRange(9, 10, 19).from).toBe(11);
    expect(clampPage(0, 10, 19)).toBe(1);
    expect(clampPage(-3, 10, 19)).toBe(1);
    expect(clampPage(Number.NaN, 10, 19)).toBe(1);
    expect(clampPage(1.7, 10, 19)).toBe(1);
  });

  test("pageOf slices the clamped page", () => {
    const rows = Array.from({ length: 19 }, (_, i) => i + 1);
    expect(pageOf(rows, 2, 10)).toEqual({ items: [11, 12, 13, 14, 15, 16, 17, 18, 19], total: 19, page: 2, limit: 10 });
    expect(pageOf(rows, 5, 10).page).toBe(2);
    expect(pageOf([], 1, 10)).toEqual({ items: [], total: 0, page: 1, limit: 10 });
  });
});
