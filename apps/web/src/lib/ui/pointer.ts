/**
 * `onpointerdown` for a row or button that acts on click while focus should stay put
 * (a field keeps its caret, a text selection stays). Only a mouse press is prevented:
 * WebKit drops a tap's click after a prevented pointerdown, so on an iPhone or iPad the
 * row would never be picked.
 */
export function keepFocusOnMouse(
  e: Pick<PointerEvent, "pointerType" | "preventDefault">,
): void {
  if (e.pointerType === "mouse") e.preventDefault();
}
