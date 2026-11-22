import { describe, expect, test } from "bun:test";
import { ApiError, loadErrorText } from "./errors";

describe("loadErrorText", () => {
  test("401 says to sign in, not the raw 'signed out'", () => {
    expect(loadErrorText(new ApiError("signed out", 401))).toBe("you're signed out. Sign in again, then try again");
  });

  test("403 and 5xx get their own reasons", () => {
    expect(loadErrorText(new ApiError("forbidden", 403))).toBe("this account can't open feedback");
    expect(loadErrorText(new ApiError("boom", 502))).toBe("the server hit an error. Try again in a minute");
  });

  test("a network failure says the server can't be reached", () => {
    expect(loadErrorText(new TypeError("Failed to fetch"))).toBe("can't reach the server. Check your connection");
  });

  test("anything else keeps its message", () => {
    expect(loadErrorText(new ApiError("ticket store offline", 409))).toBe("ticket store offline");
    expect(loadErrorText("nope")).toBe("something went wrong");
  });
});
