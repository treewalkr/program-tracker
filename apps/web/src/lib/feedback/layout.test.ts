import { describe, expect, test } from "bun:test";
import { editLayout } from "./layout";

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
