import { describe, expect, test } from "bun:test";
import { shipRange, shippedCommits } from "./feedback-shipped-lib";

const sha = (c: string) => c.repeat(40);
const log = (...rows: [string, string][]) => rows.map(([h, s]) => `${h}\x1f${s}`).join("\n");

describe("shipRange", () => {
  test("since the release tag before HEAD", () => {
    expect(shipRange("v0.1.18")).toBe("v0.1.18..HEAD");
  });
  test("whole history without a tag", () => {
    expect(shipRange(null)).toBe("HEAD");
  });
});

describe("shippedCommits", () => {
  test("keeps only commits that name tickets, oldest first, with their handles", () => {
    const out = shippedCommits(
      log(
        [sha("a"), "fix: clearer rest timer (FB-012)"],
        [sha("b"), "chore: release v0.1.19"],
        [sha("c"), "fix: two at once (FB-3, FB-014)"],
      ),
    );
    expect(out).toEqual([
      { sha: sha("a"), subject: "fix: clearer rest timer (FB-012)", handles: [12] },
      { sha: sha("c"), subject: "fix: two at once (FB-3, FB-014)", handles: [3, 14] },
    ]);
  });

  test("ignores lowercase references, blank lines and malformed rows", () => {
    expect(shippedCommits(["", `${sha("d")}\x1ffix: thing (fb-12)`, "no separator FB-1", `nothex\x1ffix: x (FB-1)`].join("\n"))).toEqual([]);
  });

  test("a subject may itself contain the separator character", () => {
    expect(shippedCommits(`${sha("e")}\x1ffix: a\x1fb (FB-7)`)).toEqual([{ sha: sha("e"), subject: "fix: a\x1fb (FB-7)", handles: [7] }]);
  });
});
