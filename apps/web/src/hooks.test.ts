import { describe, expect, test } from "bun:test";
import { reroute } from "./hooks";

const route = (path: string) => reroute({ url: new URL(path, "https://pt.test"), fetch });

describe("reroute", () => {
  test("strips a language prefix before route matching", () => {
    expect(route("/th/me/log/5")).toBe("/me/log/5");
    expect(route("/en")).toBe("/");
    expect(route("/th/")).toBe("/");
  });

  test("leaves other paths to match as they are", () => {
    expect(route("/me")).toBeUndefined();
    expect(route("/thai")).toBeUndefined();
    expect(route("/xx/me")).toBeUndefined();
  });
});
