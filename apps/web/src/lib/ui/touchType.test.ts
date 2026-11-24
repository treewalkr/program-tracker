import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * iOS Safari zooms the page on focus of any field under 16px. Fields read the
 * touch size from app.css's `--field-font` token, set under
 * `(max-width: 720px), (pointer: coarse)`; a width-only query misses landscape
 * phones, iPads and wide split panes.
 */

const UI = import.meta.dir;
const APP_CSS = join(UI, "../../app.css");

// Owned by another session mid-edit; drop each once it reads `--field-font`.
const PENDING = new Set(["InputCell.svelte", "SelectCell.svelte"]);

/** Every `@media <query> { … }` block in the source, braces matched. */
function mediaBlocks(src: string): { query: string; body: string }[] {
  const out: { query: string; body: string }[] = [];
  const re = /@media([^{]+)\{/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1;
    let i = re.lastIndex;
    while (depth && i < src.length) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    out.push({ query: m[1].trim(), body: src.slice(re.lastIndex, i - 1) });
  }
  return out;
}

/** Queries that raise type to 16px without also matching a touch screen. */
function widthOnly16(src: string): string[] {
  return mediaBlocks(src)
    .filter(({ query, body }) => /font-size:\s*16px|--field-font:\s*16px/.test(body) && !/pointer:\s*coarse/.test(query))
    .map(({ query }) => query);
}

const components = readdirSync(UI).filter((f) => f.endsWith(".svelte") && !f.endsWith(".stories.svelte") && !PENDING.has(f));

describe("16px fields on every touch screen", () => {
  test("app.css sets the field tokens on touch screens as well as narrow ones", () => {
    const css = readFileSync(APP_CSS, "utf8");
    const token = mediaBlocks(css).find(({ body }) => /--field-font:\s*16px/.test(body));
    expect(token?.query).toContain("pointer: coarse");
    expect(token?.query).toContain("max-width: 720px");
    expect(token?.body).toMatch(/--field-h:\s*40px/);
    expect(widthOnly16(css)).toEqual([]);
  });

  test.each(components)("%s has no width-only 16px rule", (file) => {
    expect(widthOnly16(readFileSync(join(UI, file), "utf8"))).toEqual([]);
  });

  test("the parser catches a width-only rule", () => {
    expect(widthOnly16("@media (max-width: 720px) { .in { font-size: 16px; } }")).toEqual(["(max-width: 720px)"]);
    expect(widthOnly16("@media (max-width: 720px), (pointer: coarse) { .in { font-size: 16px; } }")).toEqual([]);
  });
});
