import { expect, test } from "bun:test";
import { keepFocusOnMouse } from "./pointer";

test("a mouse press keeps focus; a touch or pen tap is left alone so its click fires", () => {
  for (const [pointerType, prevented] of [
    ["mouse", true],
    ["touch", false],
    ["pen", false],
  ] as const) {
    let called = false;
    keepFocusOnMouse({ pointerType, preventDefault: () => (called = true) });
    expect(called).toBe(prevented);
  }
});
