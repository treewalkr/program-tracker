/** One TOC section's box, relative to the viewport top. */
export interface SpySection {
  id: string;
  top: number;
  bottom: number;
}

/**
 * Which TOC entry is current. The section holding the reading line (the last
 * one whose top is at or above it) wins — never an earlier section whose tail
 * still pokes into the top of the screen. At the very bottom of the page the
 * last sections can never reach the line, so the one you jumped to (the hash)
 * wins if it's on screen, else the last section.
 */
export function activeSection(
  sections: readonly SpySection[],
  opts: { line: number; viewport: number; atBottom: boolean; hash?: string | null },
): string | null {
  if (sections.length === 0) return null;
  if (opts.atBottom) {
    const target = sections.find((s) => s.id === opts.hash);
    if (target && target.top < opts.viewport && target.bottom > 0) return target.id;
    return sections[sections.length - 1].id;
  }
  let current = sections[0].id;
  for (const s of sections) if (s.top <= opts.line) current = s.id;
  return current;
}
