/** How long a card must stay on screen before it counts as read. */
export const SEEN_DWELL_MS = 1000;

type Observer = Pick<IntersectionObserver, "observe" | "disconnect">;
type ObserverCtor = new (cb: IntersectionObserverCallback, opts: IntersectionObserverInit) => Observer;

/**
 * Calls `onSeen` once `node` has stayed at least half on screen for
 * `dwellMs`. Passing through the viewport — a jump to `#FB-012` scrolling
 * past the cards above it — doesn't count. Returns a stop function.
 */
export function watchSeen(
  node: Element,
  onSeen: () => void,
  { dwellMs = SEEN_DWELL_MS, Observer = IntersectionObserver as ObserverCtor } = {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const io = new Observer(
    (entries) => {
      const visible = entries.at(-1)?.isIntersecting ?? false;
      clearTimeout(timer);
      timer = undefined;
      if (!visible) return;
      timer = setTimeout(() => {
        io.disconnect();
        onSeen();
      }, dwellMs);
    },
    { threshold: 0.5 },
  );
  io.observe(node);
  return () => {
    clearTimeout(timer);
    io.disconnect();
  };
}
