import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import Tabs from "./Tabs.svelte";
import { tabKeyTarget, tabStop } from "./tabKeys";

const four = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
const gappy = [{ id: "a", disabled: true }, { id: "b" }, { id: "c", disabled: true }, { id: "d" }, { id: "e", disabled: true }];

describe("tabKeyTarget", () => {
  test("arrows step to the neighbour and wrap at both ends", () => {
    expect(tabKeyTarget(four, 1, "ArrowRight")).toBe(2);
    expect(tabKeyTarget(four, 1, "ArrowLeft")).toBe(0);
    expect(tabKeyTarget(four, 3, "ArrowRight")).toBe(0);
    expect(tabKeyTarget(four, 0, "ArrowLeft")).toBe(3);
  });

  test("Home and End jump to the first and last tab", () => {
    expect(tabKeyTarget(four, 2, "Home")).toBe(0);
    expect(tabKeyTarget(four, 1, "End")).toBe(3);
  });

  test("disabled tabs are skipped, wrapping included", () => {
    expect(tabKeyTarget(gappy, 1, "ArrowRight")).toBe(3);
    expect(tabKeyTarget(gappy, 3, "ArrowRight")).toBe(1);
    expect(tabKeyTarget(gappy, 1, "ArrowLeft")).toBe(3);
    expect(tabKeyTarget(gappy, 3, "Home")).toBe(1);
    expect(tabKeyTarget(gappy, 1, "End")).toBe(3);
  });

  test("other keys, a lone tab, and all-disabled lists do nothing", () => {
    expect(tabKeyTarget(four, 1, "ArrowDown")).toBeNull();
    expect(tabKeyTarget(four, 1, "Enter")).toBeNull();
    expect(tabKeyTarget([{ id: "a" }, { id: "b", disabled: true }], 0, "ArrowRight")).toBeNull();
    expect(tabKeyTarget([{ id: "a", disabled: true }], 0, "End")).toBeNull();
  });
});

describe("tabStop", () => {
  test("the selected tab, else the first enabled one", () => {
    expect(tabStop(four, "c")).toBe("c");
    expect(tabStop(gappy, "a")).toBe("b");
    expect(tabStop(gappy, "missing")).toBe("b");
    expect(tabStop([{ id: "a", disabled: true }], "a")).toBeUndefined();
  });
});

describe("Tabs", () => {
  const body = render(Tabs, {
    props: { items: [{ id: "x", label: "X" }, { id: "y", label: "Y" }, { id: "z", label: "Z", disabled: true }], value: "y", label: "Views", idPrefix: "v" },
  }).body;
  const tab = (id: string) => body.match(new RegExp(`<button[^>]*id="v-${id}"[^>]*>`))?.[0] ?? "";

  test("renders a named tablist of tabs pointing at their panels", () => {
    expect(body).toContain('role="tablist"');
    expect(body).toContain('aria-label="Views"');
    expect(tab("x")).toContain('role="tab"');
    expect(tab("x")).toContain('aria-controls="panel-x"');
  });

  test("roving tabindex: only the selected tab is a tab stop", () => {
    expect(tab("y")).toContain('aria-selected="true"');
    expect(tab("y")).toContain('tabindex="0"');
    expect(tab("x")).toContain('aria-selected="false"');
    expect(tab("x")).toContain('tabindex="-1"');
    expect(tab("z")).toContain('tabindex="-1"');
  });
});
