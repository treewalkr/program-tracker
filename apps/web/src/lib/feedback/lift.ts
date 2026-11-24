import { isFeedbackUi } from "./capture";

/**
 * The Feedback pill is fixed bottom right (FeedbackLayer `.bar`), 16px from the
 * edges. Anything that docks to the bottom of the screen would sit under it,
 * so the pill rides above such a bar instead of covering its buttons:
 *
 * - `watchBottomBars` finds them itself: any fixed or sticky element under the
 *   pill (a save bar, a draft's action bar, a dock), as the page scrolls and
 *   changes. Nothing to add per page.
 * - `--feedback-lift`, set on the root by a page, covers what that can't see:
 *   a composer at the foot of a full-height layout that isn't positioned at
 *   all (`liftFeedback`), or a page that docks the pill itself (the log sheet).
 *
 * The pill takes the larger of the two. The automatic lift is published on
 * the root as `--feedback-auto-lift`, so what floats above the pill (the draft
 * notices) can rise with it; such an element carries `data-no-lift` so the
 * pill never rides on it in turn.
 */
const INSET = 16;
/** Marks a fixed element that moves with the pill, never one it rides on. */
export const NO_LIFT_ATTR = "data-no-lift";
/** The idle pill when it can't be measured: about 130 × 40. */
const PILL = { width: 130, height: 40 };

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where the pill sits unlifted, `width` × `height`, in the bottom-right corner. */
export const pillHome = (viewportWidth: number, viewportHeight: number, size = PILL, left?: number): Box => ({
  left: left ?? viewportWidth - INSET - size.width,
  right: left === undefined ? viewportWidth - INSET : left + size.width,
  top: viewportHeight - INSET - size.height,
  bottom: viewportHeight - INSET,
});

/**
 * Px to lift the pill: 0 unless `bar` is under it (`pill`, unlifted), else
 * enough to sit 16px above the bar's top edge. A box reaching the top half of
 * the screen is a panel or a dialog, not a bar: riding above it would throw
 * the pill off screen.
 */
export function feedbackLift(
  bar: Box,
  viewportWidth: number,
  viewportHeight: number,
  pill: Box = pillHome(viewportWidth, viewportHeight),
): number {
  const under = bar.top < pill.bottom && bar.bottom > pill.top && bar.right > pill.left && bar.left < pill.right;
  if (!under || bar.top < viewportHeight / 2) return 0;
  return Math.ceil(viewportHeight - bar.top);
}

/**
 * Whether an element with this computed style can dock to the bottom: any
 * fixed element, or a sticky one held from the bottom. A `sticky; top:`
 * heading passing the pill is no bar to ride on.
 */
export const docksToBottom = (style: Pick<CSSStyleDeclaration, "position" | "bottom">): boolean =>
  style.position === "fixed" || (style.position === "sticky" && style.bottom !== "auto");

/** The nearest bottom-docking element holding `el` (itself included), below `<body>`. */
function dockOf(el: Element | null): Element | null {
  for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
    if (docksToBottom(getComputedStyle(e))) return e;
  }
  return null;
}

/**
 * `{@attach}` on the pill: calls `onlift` with how far to lift it over any
 * fixed or sticky bar under its unlifted spot, whenever the page scrolls,
 * resizes or changes.
 */
export function watchBottomBars(pill: HTMLElement, onlift: (px: number) => void) {
  let raf = 0;
  const update = () => {
    raf = 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = pill.getBoundingClientRect();
    if (!r.width || !r.height) return onlift(0);
    const home = pillHome(vw, vh, { width: r.width, height: r.height }, r.left);
    let lift = 0;
    const seen = new Set<Element>();
    for (const fx of [0.1, 0.5, 0.9]) {
      for (const fy of [0.2, 0.8]) {
        const x = home.left + (home.right - home.left) * fx;
        const y = home.top + (home.bottom - home.top) * fy;
        const hit = document.elementsFromPoint(x, y).find((e) => !isFeedbackUi(e) && !e.closest(`[${NO_LIFT_ATTR}]`));
        const dock = dockOf(hit ?? null);
        if (!dock || seen.has(dock)) continue;
        seen.add(dock);
        lift = Math.max(lift, feedbackLift(dock.getBoundingClientRect(), vw, vh, home));
      }
    }
    onlift(lift);
  };
  const queue = () => (raf ||= requestAnimationFrame(update));
  queue();
  document.addEventListener("scroll", queue, { capture: true, passive: true });
  window.addEventListener("resize", queue);
  const mo = new MutationObserver(queue);
  mo.observe(document.body, { childList: true, subtree: true });
  const ro = new ResizeObserver(queue);
  ro.observe(pill);
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener("scroll", queue, { capture: true });
    window.removeEventListener("resize", queue);
    mo.disconnect();
    ro.disconnect();
  };
}

/**
 * `{@attach liftFeedback}` on a bottom bar `watchBottomBars` can't see (not
 * fixed or sticky): keeps `--feedback-lift` in step with where the bar is
 * (scroll, resize, its own height) and clears it when the bar goes.
 */
export function liftFeedback(bar: HTMLElement) {
  const root = document.documentElement;
  let raf = 0;
  const update = () => {
    raf = 0;
    const lift = feedbackLift(bar.getBoundingClientRect(), window.innerWidth, window.innerHeight);
    root.style.setProperty("--feedback-lift", `${lift}px`);
  };
  const queue = () => (raf ||= requestAnimationFrame(update));
  update();
  document.addEventListener("scroll", queue, { capture: true, passive: true });
  window.addEventListener("resize", queue);
  const ro = new ResizeObserver(queue);
  ro.observe(bar);
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener("scroll", queue, { capture: true });
    window.removeEventListener("resize", queue);
    ro.disconnect();
    root.style.removeProperty("--feedback-lift");
  };
}
