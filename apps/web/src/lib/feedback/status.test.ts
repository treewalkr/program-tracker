import { describe, expect, test } from "bun:test";
import { FEEDBACK_STATUSES } from "@pt/shared";
import { entryAuthorName, STATUS_LABEL, statusLine } from "./status";

const ana = { id: "a", name: "Ana", avatarUrl: null };
const shown = { latestDone: true, shippedIn: "0.1.18" };

describe("statusLine", () => {
  test("a release's Done reads as the release, with the version it shipped in", () => {
    const c = { authorKind: "system" as const, author: null, status: "done" as const, ship: { sha: "abc1234", version: "0.1.18" } };
    expect(statusLine(c, shown)).toEqual({ who: "Release", status: "Done", tail: "v0.1.18" });
    // an older release entry keeps its own version, even after a reopen
    expect(statusLine(c, { latestDone: false, shippedIn: null })).toEqual({ who: "Release", status: "Done", tail: "v0.1.18" });
  });
  test("a person's latest Done shows the item's shipped version; older ones don't", () => {
    const c = { authorKind: "human" as const, author: ana, status: "done" as const, ship: null };
    expect(statusLine(c, shown)).toEqual({ who: "Ana", status: "Done", tail: "shipped in v0.1.18" });
    expect(statusLine(c, { latestDone: false, shippedIn: "0.1.18" }).tail).toBeNull();
    expect(statusLine({ ...c, status: "accepted" }, shown)).toEqual({ who: "Ana", status: "Accepted", tail: null });
    expect(statusLine({ ...c, status: "in_progress" }, shown)).toEqual({ who: "Ana", status: "In progress", tail: null });
  });
  test("a deleted trainer is Someone, never Unknown", () => {
    expect(statusLine({ authorKind: "human", author: null, status: "wontfix", ship: null }, shown).who).toBe("Someone");
  });
});

describe("entryAuthorName", () => {
  test("names releases and the AI", () => {
    expect(entryAuthorName({ authorKind: "system", author: null })).toBe("Release");
    expect(entryAuthorName({ authorKind: "ai", author: null })).toBe("AI assistant");
    expect(entryAuthorName({ authorKind: "human", author: ana })).toBe("Ana");
  });
});

describe("STATUS_LABEL", () => {
  test("follows the status flow, which is also the tab order", () => {
    expect(Object.keys(STATUS_LABEL)).toEqual([...FEEDBACK_STATUSES]);
    expect(Object.values(STATUS_LABEL)).toEqual(["New", "Accepted", "In progress", "Done", "Won't fix"]);
  });
});
