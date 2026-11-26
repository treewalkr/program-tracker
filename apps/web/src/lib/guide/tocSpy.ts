/** One TOC section's box, relative to the viewport top. */
export interface SpySection {
  id: string;
  top: number;
  bottom: number;
}

/**
 * Which TOC entry is current: the first section overlapping the band above
 * the reading line, else the last one that has scrolled past it.
 */
export function activeSection(
  sections: readonly SpySection[],
  opts: { line: number; viewport: number; atBottom: boolean; hash?: string | null },
): string | null {
  if (sections.length === 0) return null;
  const inBand = sections.find((s) => s.top <= opts.line && s.bottom > 0);
  return (inBand ?? sections[0]).id;
}
