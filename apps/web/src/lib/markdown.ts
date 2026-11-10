import { Marked, marked } from "marked";

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

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Only these link targets become anchors; anything else (javascript:, data:, …) stays plain text. */
const SAFE_HREF = /^(https?:|mailto:|\/(?!\/)|#)/i;

const safe = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // raw HTML in the source is shown as text, never injected
    html: ({ text }) => escapeHtml(text),
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (!SAFE_HREF.test(href.trim())) return label;
      const t = title ? ` title="${escapeHtml(title)}"` : "";
      return `<a href="${escapeHtml(href)}"${t} target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
    },
    // no remote images in a thread: show the alt text instead
    image: ({ text }) => escapeHtml(text),
  },
});

/**
 * Markdown for text other people (or the feedback AI) wrote — feedback
 * thread replies. Raw HTML is escaped, links are limited to http(s)/mailto/
 * in-app paths and images are dropped, so the output is safe for {@html}.
 */
export function renderSafeMarkdown(text: string | null | undefined): string {
  if (!text) return "";
  return safe.parse(text, { async: false }) as string;
}
