import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { render } from "svelte/server";
import { buildImportResult, chunkLines, importLines, mockImportExtraction, type ImportAb, type ImportResult } from "@pt/shared";
import ImportWeekPicker from "./ImportWeekPicker.svelte";

/** A paste read the way the API reads it (mock extraction: real chunks for FB-015). */
function read(name: string): ImportResult {
  const text = readFileSync(new URL(`../../../../../packages/shared/fixtures/import/${name}`, import.meta.url), "utf8");
  const lines = importLines(text);
  return buildImportResult(text, chunkLines(lines).map((c) => ({ ...c, ok: true as const, data: mockImportExtraction(lines, c.from, c.to) })));
}

const noop = () => {};
const html = (result: ImportResult, over: { pickAb?: boolean; pick?: ImportAb | null; error?: string | null; block?: number } = {}) =>
  render(ImportWeekPicker, {
    props: { result, block: over.block ?? result.defaultBlock, pickAb: false, pick: null, onblock: noop, onab: noop, ...over },
  }).body;

/** The <option>s of a select, as text. */
const optionsOf = (body: string, id: string) => {
  const select = body.slice(body.indexOf(`id="${id}"`));
  return [...select.slice(0, select.indexOf("</select>")).matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
};

describe("ImportWeekPicker", () => {
  test("FB-015: three blocks, the latest picked, and A/B weeks offered", () => {
    const r = read("fb-015-ab.txt");
    const body = html(r);
    expect(body).toContain("Found <span class=\"num\">3</span> blocks. Draft which one?");
    expect(body).toContain("Week 1 (คี่) (Push · Pull)");
    expect(body).toContain("Week 2 (คู่) (squat+vertical · Deadlift + Horizontal)");
    expect(body.match(/name="pi-block"/g)).toHaveLength(4);
    expect(body).toContain(">A/B weeks<");
    // the latest block is the default; nothing is guessed
    expect(body).toMatch(/value="2" checked/);
    expect(body).not.toMatch(/value="ab" checked/);
    expect(body).toContain(">latest<");
    // the week selects only show once A/B weeks is picked
    expect(body).not.toContain("<select");
  });

  test("one block of two weeks: the picker shows with the one-block legend", () => {
    const r = read("week11-12.txt");
    // two similar weeks group into one block (week11-12 itself reads as two)
    r.blocks = [{ weeks: [0, 1] }];
    r.defaultBlock = 0;
    const body = html(r);
    expect(body).toContain("Draft one week or A/B weeks?");
    expect(body).not.toContain("blocks. Draft which one?");
    expect(body).toContain(">A/B weeks<");
    expect(body).not.toContain(">latest<");
  });

  test("only one week with training: no picker", () => {
    const r = read("fb-015-ab.txt");
    r.weeks[2].days = [];
    r.blocks = [{ weeks: [0, 1, 2] }];
    expect(html(r)).not.toContain("<fieldset");
  });

  test("A/B weeks found in the notes: no A/B option here (their own box handles it)", () => {
    const r = read("week11-12.txt");
    r.ab = { a: 0, b: 1, source: "notes" };
    r.blocks = [{ weeks: [0, 1] }];
    r.defaultBlock = 0;
    expect(html(r)).not.toContain("<fieldset");
    // declined with several blocks: just the block choice
    r.blocks = [{ weeks: [0] }, { weeks: [1] }];
    const body = html(r);
    expect(body).toContain("blocks. Draft which one?");
    expect(body).not.toContain("A/B weeks");
  });

  test("A/B weeks picked: labelled Week A and Week B selects of the weeks with training", () => {
    const r = read("fb-015-ab.txt");
    const body = html(r, { pickAb: true, pick: { a: 1, b: 2, source: "picked" } });
    expect(body).toMatch(/value="ab" checked/);
    expect(body).toMatch(/<label[^>]*for="pi-ab-a"[^>]*>Week A<\/label>/);
    expect(body).toMatch(/<label[^>]*for="pi-ab-b"[^>]*>Week B<\/label>/);
    const weeks = ["Week 1 (คี่) (Push · Pull)", "Week 2 (คู่) (squat+vertical · Deadlift + Horizontal)"];
    // the empty first week isn't listed
    expect(optionsOf(body, "pi-ab-a")).toEqual(weeks);
    expect(optionsOf(body, "pi-ab-b")).toEqual(weeks);
    expect(body).toMatch(/id="pi-ab-a"[\s\S]*?<option value="1" selected/);
    expect(body).toMatch(/id="pi-ab-b"[\s\S]*?<option value="2" selected/);
    expect(body).toContain("Odd weeks run A, even weeks B.");
    expect(body).not.toContain("pi-ab-error");
    // no block is checked while A/B weeks is
    expect(body).not.toMatch(/value="\d" checked/);
  });

  test("the same week for both: the message, tied to the selects", () => {
    const r = read("fb-015-ab.txt");
    const body = html(r, { pickAb: true, pick: { a: 1, b: 1, source: "picked" }, error: "Pick two different weeks for A and B." });
    expect(body).toContain('id="pi-ab-error"');
    expect(body).toContain("Pick two different weeks for A and B.");
    expect(body).toContain('aria-describedby="pi-ab-error"');
    expect(body).toContain('aria-invalid="true"');
  });

  test("alternating blocks: a hint to pick A/B weeks, nothing picked", () => {
    const r = read("fb-015-ab.txt");
    r.alternating = true;
    const body = html(r);
    expect(body).toContain("Looks like A/B weeks. Pick A/B weeks to draft both.");
    expect(body).not.toMatch(/value="ab" checked/);
  });
});
