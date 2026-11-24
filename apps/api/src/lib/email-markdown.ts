import { Marked, type Tokens } from "marked";

/**
 * Thread replies are markdown (the app renders them with `renderSafeMarkdown`,
 * apps/web/src/lib/markdown.ts); emails show them the same way. Same safety
 * rules — raw HTML escaped, links only to http(s)/mailto/app paths, no remote
 * images — plus inline styles, since mail clients drop <style> rules they
 * don't know, and wrapping code so a long line can't widen the message.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const SAFE_HREF = /^(https?:|mailto:|\/(?!\/)|#)/i;
const MONO = "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px";
const WRAP = "white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word";

const html = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: ({ text }) => esc(text),
    image: ({ text }) => esc(text),
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (!SAFE_HREF.test(href.trim())) return label;
      const t = title ? ` title="${esc(title)}"` : "";
      return `<a class="pt-link" href="${esc(href)}"${t} style="color:#0969da;overflow-wrap:anywhere;word-break:break-word">${label}</a>`;
    },
    paragraph({ tokens }) {
      return `<p style="margin:0 0 8px">${this.parser.parseInline(tokens)}</p>`;
    },
    code({ text }: Tokens.Code) {
      return `<pre class="pt-code" style="margin:0 0 8px;padding:8px 10px;border-radius:6px;background:#f6f8fa;${MONO};line-height:1.45;${WRAP}"><code>${esc(text)}</code></pre>`;
    },
    codespan({ text }) {
      return `<code class="pt-code" style="padding:1px 4px;border-radius:4px;background:#f6f8fa;${MONO};overflow-wrap:anywhere;word-break:break-word">${esc(text)}</code>`;
    },
    blockquote({ tokens }) {
      return `<blockquote class="pt-quote" style="margin:0 0 8px;padding:0 0 0 10px;border-left:3px solid #d0d7de">${this.parser.parse(tokens)}</blockquote>`;
    },
    heading({ tokens }) {
      return `<p style="margin:0 0 8px;font-weight:600">${this.parser.parseInline(tokens)}</p>`;
    },
  },
});

/** A reply as email HTML, inline-styled. */
export function markdownEmailHtml(text: string): string {
  return (html.parse(text, { async: false }) as string).trim();
}

/**
 * A reply as plain text: the reading marks go (`**`, backticks, fences),
 * a link keeps its address next to its label, code keeps its lines.
 */
export function markdownEmailText(text: string): string {
  const out: string[] = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      out.push(`    ${line}`);
      continue;
    }
    out.push(
      line
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => (label === href ? href : `${label} (${href})`))
        .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
        .replace(/`([^`]+)`/g, "$1"),
    );
  }
  return out.join("\n");
}
