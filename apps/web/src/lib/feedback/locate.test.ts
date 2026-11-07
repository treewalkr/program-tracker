import { describe, expect, test } from "bun:test";
import type { FeedbackContext } from "@pt/shared";
import { locateTarget } from "./locate";

/** Just enough of an Element for the locator: tag, text, parent, Svelte dev meta. */
const el = (tag: string, text: string, line?: number) =>
  ({
    tagName: tag.toUpperCase(),
    textContent: text,
    parentElement: null,
    __svelte_meta: line ? { loc: { file: "src/lib/A.svelte", line, column: 2 }, parent: null } : null,
  }) as unknown as Element;

/** A root that answers `querySelectorAll` from a selector → elements table. */
const root = (table: Record<string, Element[]>) =>
  ({ querySelectorAll: (s: string) => table[s] ?? [] }) as unknown as ParentNode;

const SEL = "main > span.chip";
const SRC = { file: "apps/web/src/lib/A.svelte", line: 12, column: 2 };

const target = (over: Partial<FeedbackContext["target"]> = {}): FeedbackContext["target"] => ({
  source: null,
  chain: [],
  tag: "span",
  text: "4×8",
  html: "",
  headings: [],
  selector: SEL,
  rect: { x: 0, y: 0, width: 0, height: 0 },
  ...over,
});

describe("locateTarget", () => {
  test("picks the selector hit with the same text", () => {
    const b = el("span", "4×8");
    expect(locateTarget(target(), { root: root({ [SEL]: [el("span", "3×10"), b] }) })).toBe(b);
  });

  test("rows from one source line are told apart by text, not position", () => {
    const rowA = el("span", "Cardio behind", 12);
    const rowB = el("span", "Week 2 ends", 12);
    const r = root({ [SEL]: [rowA, rowB] });
    expect(locateTarget(target({ source: SRC, text: "Week 2 ends" }), { root: r })).toBe(rowB);
    expect(locateTarget(target({ source: SRC, text: "Low adherence" }), { root: r })).toBeNull();
  });

  test("source narrows selector hits before the text check", () => {
    const otherTemplate = el("span", "4×8", 9);
    const same = el("span", "4×8", 12);
    expect(locateTarget(target({ source: SRC }), { root: root({ [SEL]: [otherTemplate, same] }) })).toBe(same);
  });

  test("an element with no text takes a lone candidate", () => {
    const input = el("input", "");
    expect(locateTarget(target({ tag: "input", text: "" }), { root: root({ [SEL]: [input] }) })).toBe(input);
  });

  test("loose takes a drifted lone hit of the same tag; strict does not", () => {
    const drifted = el("span", "5×5");
    const r = root({ [SEL]: [drifted] });
    expect(locateTarget(target(), { root: r })).toBeNull();
    expect(locateTarget(target(), { root: r, loose: true })).toBe(drifted);
    expect(locateTarget(target({ tag: "div" }), { root: r, loose: true })).toBeNull();
  });

  test("falls back to the same source line when the selector misses", () => {
    const moved = el("span", "4×8", 12);
    const r = root({ span: [el("span", "x", 3), moved] });
    expect(locateTarget(target({ source: SRC }), { root: r })).toBe(moved);
  });

  test("an invalid selector is a miss", () => {
    const r = { querySelectorAll: () => { throw new Error("bad selector"); } } as unknown as ParentNode;
    expect(locateTarget(target(), { root: r })).toBeNull();
  });
});
