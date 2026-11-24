import { describe, expect, test } from "bun:test";
import { placePanel } from "./place";

/** A 40px-tall trigger whose top edge sits at `top`. */
const at = (top: number) => ({ top, bottom: top + 40 });
const phone = { height: 664, offsetTop: 0 };

describe("placePanel", () => {
  test("opens below when the panel fits under the trigger", () => {
    expect(placePanel(at(100), 200, phone)).toEqual({ side: "below", maxHeight: 664 - 140 - 4 - 8 });
  });

  test("flips above when there's no room below but there is above", () => {
    const p = placePanel(at(560), 250, phone);
    expect(p.side).toBe("above");
    expect(p.maxHeight).toBe(560 - 4 - 8);
  });

  test("caps the height on the roomier side when neither side fits", () => {
    const small = { height: 400, offsetTop: 0 };
    expect(placePanel(at(240), 300, small)).toEqual({ side: "above", maxHeight: 228 });
    expect(placePanel(at(100), 300, small)).toEqual({ side: "below", maxHeight: 248 });
  });

  test("an on-screen keyboard shrinks the room below (visualViewport)", () => {
    // Keyboard took the bottom 300px: the field at 300 now has 64px under it, 300px over it.
    const keyboard = { height: 364, offsetTop: 0 };
    expect(placePanel(at(300), 258, phone).side).toBe("below");
    const p = placePanel(at(300), 258, keyboard);
    expect(p.side).toBe("above");
    expect(p.maxHeight).toBe(288);
  });

  test("a scrolled visual viewport (offsetTop) moves the visible band", () => {
    // Visible band is 200..564 in layout coordinates.
    const vv = { height: 364, offsetTop: 200 };
    expect(placePanel(at(400), 150, vv)).toEqual({ side: "above", maxHeight: 188 });
    expect(placePanel(at(240), 120, vv)).toEqual({ side: "below", maxHeight: 272 });
  });

  test("never returns a negative height", () => {
    expect(placePanel(at(-100), 200, phone).maxHeight).toBeGreaterThanOrEqual(0);
  });
});
