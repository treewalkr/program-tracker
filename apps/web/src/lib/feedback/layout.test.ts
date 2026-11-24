import { describe, expect, test } from "bun:test";
import { editLayout, placePin } from "./layout";

const file = (name: string) => new File(["x"], name, { type: "image/webp" });

describe("editLayout", () => {
  test("keeps stored images by id and numbers new files in the order shown", () => {
    const a = file("a.webp");
    const b = file("b.webp");
    expect(
      editLayout([
        { file: b, stored: undefined },
        { file: null, stored: { id: "s1", kind: "upload" } },
        { file: a },
        { file: null, stored: { id: "el", kind: "element" } },
      ]),
    ).toEqual({ layout: [{ upload: 0 }, { keep: "s1" }, { upload: 1 }, { keep: "el" }], images: [b, a] });
  });
  test("an empty tray removes every image; files still compressing are left out", () => {
    expect(editLayout([])).toEqual({ layout: [], images: [] });
    expect(editLayout([{ file: null }])).toEqual({ layout: [], images: [] });
  });
});

describe("placePin", () => {
  const desk = { width: 1280, height: 800, floor: 744 };
  const phone = { width: 320, height: 568, floor: 512 };

  test("goes below the element when it fits, aligned to its left edge", () => {
    expect(placePin({ top: 100, bottom: 140, left: 300 }, 280, desk)).toEqual({ left: 300, top: 148, width: 340, maxHeight: 728 });
  });

  test("goes above when there is no room below", () => {
    const p = placePin({ top: 600, bottom: 640, left: 300 }, 400, desk);
    expect(p.top).toBe(600 - 8 - 400);
  });

  test("a tall pin with no room either side sits against the roomier edge, inside the screen", () => {
    // iPhone SE, Bug expanded (~490px), element in the lower half: the pin takes the top
    const p = placePin({ top: 300, bottom: 334, left: 20 }, 490, phone);
    expect(p.top).toBe(8);
    expect(p.top + Math.min(490, p.maxHeight)).toBeLessThanOrEqual(phone.floor - 8);
  });

  test("never taller than the space above the Feedback bar, so Send stays reachable", () => {
    const p = placePin({ top: 50, bottom: 80, left: 0 }, 2000, phone);
    expect(p.maxHeight).toBe(512 - 16);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(512 - 8);
  });

  test("spans a phone screen and never hangs off its sides", () => {
    expect(placePin({ top: 10, bottom: 40, left: 250 }, 200, phone)).toMatchObject({ left: 8, width: 304 });
    expect(placePin({ top: 10, bottom: 40, left: 1200 }, 200, desk)).toMatchObject({ left: 1280 - 340 - 8 });
  });
});
