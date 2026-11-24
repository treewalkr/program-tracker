/** Gap between the trigger and the panel (the panel's 4px margin). */
export const GAP = 4;
/** Breathing room kept between the panel and the viewport edge. */
export const MARGIN = 8;

export interface Placement {
  side: "below" | "above";
  /** The tallest the panel may be on that side, in px. */
  maxHeight: number;
}

/**
 * Where an open select panel goes: below the trigger when it fits, above when
 * only that side fits, otherwise the roomier side with its height capped.
 * `viewport` is the visible band in layout coordinates: pass
 * `visualViewport` (height + offsetTop) so an on-screen keyboard counts.
 */
export function placePanel(
  trigger: { top: number; bottom: number },
  panelHeight: number,
  viewport: { height: number; offsetTop: number },
): Placement {
  const below = Math.max(0, viewport.offsetTop + viewport.height - trigger.bottom - GAP - MARGIN);
  const above = Math.max(0, trigger.top - viewport.offsetTop - GAP - MARGIN);
  if (panelHeight <= below) return { side: "below", maxHeight: below };
  if (panelHeight <= above) return { side: "above", maxHeight: above };
  return below >= above ? { side: "below", maxHeight: below } : { side: "above", maxHeight: above };
}

/** Scroll `list` (only the list, never the page) so `row` is fully inside it. */
export function keepInView(list: HTMLElement, row: HTMLElement) {
  const r = row.getBoundingClientRect();
  const l = list.getBoundingClientRect();
  if (r.top < l.top) list.scrollTop -= l.top - r.top;
  else if (r.bottom > l.bottom) list.scrollTop += r.bottom - l.bottom;
}
