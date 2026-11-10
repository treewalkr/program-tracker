import { describe, expect, test } from "bun:test";
import type { FeedbackContext } from "@pt/shared";
import { anchorOf } from "./capture";
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

/** An anchor host: answers `querySelectorAll(tag)` with its descendants of that tag. */
const host = (tag: string, kids: Element[], text = "") =>
  ({
    ...(el(tag, text) as object),
    querySelectorAll: (s: string) => kids.filter((k) => k.tagName.toLowerCase() === s),
  }) as unknown as Element;

describe("locateTarget with a stable anchor", () => {
  const ROW = '[data-set-id="s2"]';

  test("anchor + text wins even when the selector points elsewhere", () => {
    const decoy = el("span", "4×8");
    const real = el("span", "4×8");
    const r = root({ [SEL]: [decoy], [ROW]: [host("li", [el("span", "Back squat"), real])] });
    const anchor = { attr: "data-set-id", value: "s2", depth: 1 };
    expect(locateTarget(target({ anchor }), { root: r })).toBe(real);
  });

  test("an anchor on the element itself matches by tag", () => {
    const btn = el("button", "Save");
    const r = root({ '[aria-label="Save program"]': [btn] });
    expect(locateTarget(target({ tag: "button", text: "Save", anchor: { attr: "aria-label", value: "Save program", depth: 0 } }), { root: r })).toBe(btn);
    expect(locateTarget(target({ tag: "span", text: "Save", anchor: { attr: "aria-label", value: "Save program", depth: 0 } }), { root: r })).toBeNull();
  });

  test("a missing anchor falls back to the selector", () => {
    const b = el("span", "4×8");
    const r = root({ [SEL]: [b] });
    expect(locateTarget(target({ anchor: { attr: "data-set-id", value: "gone", depth: 1 } }), { root: r })).toBe(b);
  });

  test("anchor text drift falls back to the selector logic", () => {
    const drifted = el("span", "5×5");
    const r = root({ [SEL]: [drifted], [ROW]: [host("li", [drifted])] });
    const t = target({ anchor: { attr: "data-set-id", value: "s2", depth: 1 } });
    expect(locateTarget(t, { root: r })).toBeNull();
    expect(locateTarget(t, { root: r, loose: true })).toBe(drifted);
  });

  test("old items without an anchor locate as before", () => {
    const b = el("span", "4×8");
    const old = target();
    delete old.anchor;
    expect(locateTarget(old, { root: root({ [SEL]: [b] }) })).toBe(b);
    expect(locateTarget(target({ anchor: null }), { root: root({ [SEL]: [b] }) })).toBe(b);
  });
});

/** A DOM-ish element with attributes, for `anchorOf`. */
const node = (tag: string, attrs: Record<string, string>, parent: Element | null = null) =>
  ({
    tagName: tag.toUpperCase(),
    id: attrs.id ?? "",
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    getAttribute: (n: string) => attrs[n] ?? null,
    parentElement: parent,
  }) as unknown as Element;

describe("anchorOf", () => {
  const counts = (table: Record<string, number>) =>
    ({ querySelectorAll: (s: string) => ({ length: table[s] ?? 0 }) }) as unknown as ParentNode;

  test("takes the nearest attribute that is unique on the page", () => {
    const row = node("li", { "data-set-id": "s2" });
    const chip = node("span", { "aria-label": "Edit set" }, row);
    const r = counts({ '[aria-label="Edit set"]': 5, '[data-set-id="s2"]': 1 });
    expect(anchorOf(chip, 4, r)).toEqual({ attr: "data-set-id", value: "s2", depth: 1 });
  });

  test("skips generated ids and framework data attributes", () => {
    const el = node("div", { id: "bits-1234", "data-state": "open", name: "weight" });
    const r = counts({ '[id="bits-1234"]': 1, '[data-state="open"]': 1, '[name="weight"]': 1 });
    expect(anchorOf(el, 4, r)).toEqual({ attr: "name", value: "weight", depth: 0 });
  });

  test("stops at main and gives up without a unique attribute", () => {
    const main = node("main", { id: "content" });
    const el = node("span", {}, main);
    expect(anchorOf(el, 4, counts({ '[id="content"]': 1 }))).toBeNull();
  });

  test("quotes in values are escaped", () => {
    const el = node("button", { "aria-label": 'Say "hi"' });
    expect(anchorOf(el, 4, counts({ '[aria-label="Say \\"hi\\""]': 1 }))).toEqual({ attr: "aria-label", value: 'Say "hi"', depth: 0 });
  });
});
