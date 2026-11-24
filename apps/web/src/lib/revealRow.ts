import { tick } from "svelte";

/**
 * After adding to a library list: bring the new row (marked `data-row="<id>"`)
 * into view when it landed off-screen — clear of the floating Feedback pill —
 * and flash it once, so a tap on Add visibly did something on a phone.
 */
export async function revealRow(id: string | number): Promise<void> {
  await tick();
  const el = document.querySelector<HTMLElement>(`[data-row="${CSS.escape(String(id))}"]`);
  if (!el) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const r = el.getBoundingClientRect();
  if (r.top < 0 || r.bottom > innerHeight - 96) el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  if (!reduce) el.animate?.([{ backgroundColor: "var(--good-bg)" }, { backgroundColor: "transparent" }], { duration: 1800, easing: "ease-out" });
}
