import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

/**
 * Render LLM-authored prose (draft rationale, client summaries) as markdown.
 * Output is fed to {@html} — content originates from this trainer's own
 * generation pipeline, not arbitrary users.
 */
export function renderMarkdown(text: string | null | undefined): string {
  if (!text) return "";
  return marked.parse(text, { async: false }) as string;
}

/** One line of inline markdown (bold, italics, code, links) with no wrapping paragraph. */
export function renderInlineMarkdown(text: string): string {
  return marked.parseInline(text, { async: false }) as string;
}
