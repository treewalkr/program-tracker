import { describe, expect, test } from "bun:test";
import { isFiltering, readListParams, writeListParams } from "./listParams";

const spec = { status: ["all", "active", "paused"], sort: ["name", "last"], trainer: null } as const;
const url = (qs: string) => new URL(`http://x/clients${qs}`);

describe("list URL params", () => {
  test("defaults when the URL is bare", () => {
    expect(readListParams(url("").searchParams, spec)).toEqual({
      q: "",
      page: 1,
      limit: 10,
      params: { status: "all", sort: "name", trainer: "" },
    });
  });

  test("reads values; unknown values and junk fall back", () => {
    const s = readListParams(url("?q=ada&status=paused&sort=bogus&trainer=t1&page=3&limit=25").searchParams, spec);
    expect(s).toEqual({ q: "ada", page: 3, limit: 25, params: { status: "paused", sort: "name", trainer: "t1" } });
    const junk = readListParams(url("?page=-2&limit=20").searchParams, spec);
    expect(junk.page).toBe(1);
    expect(junk.limit).toBe(10);
  });

  test("a filter, search or limit change resets the page; defaults leave the URL", () => {
    const at = url("?page=3&status=active&demo");
    expect(writeListParams(at, spec, { params: { status: "all" } }).search).toBe("?demo=");
    expect(writeListParams(at, spec, { q: "ada" }).searchParams.get("page")).toBeNull();
    expect(writeListParams(at, spec, { limit: 25 }).search).toBe("?status=active&demo=&limit=25");
    expect(writeListParams(at, spec, { limit: 10 }).searchParams.has("limit")).toBe(false);
    expect(writeListParams(at, spec, { q: "  " }).searchParams.has("q")).toBe(false);
  });

  test("a page change keeps the filters; page 1 leaves the URL", () => {
    const at = url("?status=active");
    expect(writeListParams(at, spec, { page: 2 }).search).toBe("?status=active&page=2");
    expect(writeListParams(url("?page=2"), spec, { page: 1 }).search).toBe("");
  });

  test("filtering is search or a non-default param", () => {
    expect(isFiltering(readListParams(url("?page=2&limit=50").searchParams, spec), spec)).toBe(false);
    expect(isFiltering(readListParams(url("?trainer=t1").searchParams, spec), spec)).toBe(true);
    expect(isFiltering(readListParams(url("?q=a").searchParams, spec), spec)).toBe(true);
  });
});
