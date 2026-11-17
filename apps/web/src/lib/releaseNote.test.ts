import { describe, expect, it } from "vitest";
import { quietRoute } from "./releaseNote";

describe("quietRoute", () => {
  it.each(["/whats-new", "/clients/abc/log", "/clients/abc/chat", "/clients/abc/generate", "/clients/abc/programs/new", "/exercises"])(
    "%s keeps the toast away",
    (p) => expect(quietRoute(p)).toBe(true),
  );
  it.each(["/", "/clients", "/clients/abc", "/programs/abc", "/settings"])("%s shows it", (p) => expect(quietRoute(p)).toBe(false));
});
