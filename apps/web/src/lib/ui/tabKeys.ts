/**
 * WAI-ARIA tabs keyboard model: ArrowLeft/ArrowRight step to the previous or
 * next enabled tab (wrapping), Home/End jump to the first/last enabled one.
 * Returns the index to move to, or null when the key isn't a tab key or no
 * other enabled tab exists.
 */
export function tabKeyTarget(tabs: readonly { disabled?: boolean }[], from: number, key: string): number | null {
  const enabled = tabs.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);
  if (!enabled.length) return null;
  if (key === "Home") return enabled[0];
  if (key === "End") return enabled[enabled.length - 1];
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const step = key === "ArrowRight" ? 1 : -1;
  const n = tabs.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from + step * k) % n) + n) % n;
    if (!tabs[i].disabled) return i === from ? null : i;
  }
  return null;
}

/** The tab that holds tabindex 0: the selected one, else the first enabled. */
export function tabStop<T extends { id: string; disabled?: boolean }>(tabs: readonly T[], value: string): string | undefined {
  return (tabs.find((t) => t.id === value && !t.disabled) ?? tabs.find((t) => !t.disabled))?.id;
}
