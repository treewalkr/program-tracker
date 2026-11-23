/**
 * The Feedback pill is fixed bottom right (FeedbackLayer `.bar`): 16px from the
 * edges, about 130px wide and 40px tall. A page with its own floating bar (the
 * program save bar, the chat composer on a phone) sets `--feedback-lift` so the
 * pill rides above it instead of covering its buttons or hint.
 */
const PILL = { inset: 16, width: 130, height: 40 };

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Px to lift the pill: 0 unless `bar` is under it, else enough to sit 16px above the bar's top edge. */
export function feedbackLift(bar: Box, viewportWidth: number, viewportHeight: number): number {
  const edge = viewportHeight - PILL.inset;
  const under =
    bar.top < edge &&
    bar.bottom > edge - PILL.height &&
    bar.right > viewportWidth - PILL.inset - PILL.width &&
    bar.left < viewportWidth - PILL.inset;
  return under ? Math.ceil(viewportHeight - bar.top) : 0;
}

/**
 * `{@attach liftFeedback}` on a floating bar: keeps `--feedback-lift` in step with
 * where the bar is (scroll, resize, its own height) and clears it when the bar goes.
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
