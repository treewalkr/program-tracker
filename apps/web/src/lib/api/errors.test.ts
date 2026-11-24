import { describe, expect, test } from "bun:test";
import { NETWORK_ERROR, SERVER_ERROR, apiFailure, errorRef, errorText, isTransient, reasonText, saveErrorText } from "./errors";

const SQL = 'Failed query: select "id" from "session_logs" params: cb3f678e-1111-4222-8333-944445555666';

describe("apiFailure", () => {
  test("a 4xx keeps the API's own sentence", () => {
    const e = apiFailure({ status: 409, value: { error: "name already taken" } });
    expect(e.message).toBe("name already taken");
    expect(e.status).toBe(409);
    expect(isTransient(e)).toBe(false);
  });

  test("a 5xx never shows its body, raw string or not", () => {
    for (const value of [SQL, { error: SQL }, { error: "Something went wrong on our side", requestId: "req12345" }, null]) {
      const e = apiFailure({ status: 500, value });
      expect(e.message).toBe(SERVER_ERROR);
      expect(e.message).not.toContain("session_logs");
    }
  });

  test("the request id comes from the 500 body, else the response header", () => {
    expect(apiFailure({ status: 500, value: { error: "x", requestId: "req12345" } }).requestId).toBe("req12345");
    expect(apiFailure({ status: 502, value: "Bad Gateway" }, { "x-request-id": "hdr98765" }).requestId).toBe("hdr98765");
    expect(errorRef(apiFailure({ status: 500, value: null }))).toBeNull();
  });

  test("a dropped connection reads as one, not as Eden's made-up 503", () => {
    const e = apiFailure({ status: 503, value: new TypeError("Load failed") });
    expect(e.message).toBe(NETWORK_ERROR);
    expect(e.network).toBe(true);
    expect(e.requestId).toBeNull();
  });

  test("a 4xx with no sentence falls back to the generic line, not a status code", () => {
    expect(apiFailure({ status: 400, value: { type: "parse" } }).message).toBe(SERVER_ERROR);
  });
});

describe("page text", () => {
  test("a failed save says the entries are still here only when trying again can help", () => {
    expect(saveErrorText(apiFailure({ status: 503, value: new TypeError("x") }))).toBe(
      "Couldn't reach the server — your changes are still here. Try again.",
    );
    expect(saveErrorText(apiFailure({ status: 500, value: SQL }))).toBe(
      "Something went wrong on our side — your changes are still here. Try again.",
    );
    expect(saveErrorText(apiFailure({ status: 422, value: { error: "reps: Too small" } }))).toBe("reps: Too small");
  });

  test("errorText hides any 5xx message, even one built elsewhere", () => {
    expect(errorText(Object.assign(new Error(SQL), { status: 500 }))).toBe(SERVER_ERROR);
    expect(errorText(new Error("client not found"))).toBe("client not found");
    expect(errorText("boom")).toBe(SERVER_ERROR);
  });

  test("reasonText reads after a dash, lowercase and without a closing period", () => {
    expect(reasonText(apiFailure({ status: 500, value: SQL }))).toBe("something went wrong on our side. Try again");
    expect(reasonText(apiFailure({ status: 503, value: new TypeError("x") }))).toBe(
      "can't reach the server. Check your connection and try again",
    );
    expect(reasonText(new Error("client not found."))).toBe("client not found");
    expect(reasonText(undefined)).toBe("something went wrong. Try again");
  });
});
