import type { NoteAnchorDto } from "$lib/api/types";

/** Longest quote a text note keeps (the API caps at 2000). */
export const NOTE_QUOTE_MAX = 600;

/**
 * Text anchor for a selection inside a rendered reply. The reply is shown as
 * markdown, so the selected text may differ from the stored source (markup,
 * line breaks); offsets point into the source when the quote is found there,
 * else they fall back to 0..quote length — the quote itself stays exact.
 */
export function textAnchor(content: string, selected: string): Extract<NoteAnchorDto, { type: "text" }> | null {
  const quote = selected.replace(/\s+/g, " ").trim().slice(0, NOTE_QUOTE_MAX);
  if (quote.length < 2) return null;
  let start = content.indexOf(quote);
  if (start < 0) {
    // markdown/line breaks: match on collapsed whitespace, then map back
    const map: number[] = [];
    let flat = "";
    for (let i = 0; i < content.length; i++) {
      const ws = /\s/.test(content[i]);
      if (ws && flat.endsWith(" ")) continue;
      flat += ws ? " " : content[i];
      map.push(i);
    }
    const at = flat.indexOf(quote);
    if (at >= 0) {
      start = map[at];
      const endIdx = map[at + quote.length - 1];
      return { type: "text", quote, start, end: endIdx + 1 };
    }
    return { type: "text", quote, start: 0, end: quote.length };
  }
  return { type: "text", quote, start, end: start + quote.length };
}
