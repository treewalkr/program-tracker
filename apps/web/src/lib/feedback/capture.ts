import {
  snapshotJson,
  toRepoPath,
  type FeedbackChainEntry,
  type FeedbackContext,
  type FeedbackSourceLoc,
} from "@pt/shared";

/** Marks the feedback UI itself so the picker and screenshots skip it. */
export const FEEDBACK_UI_ATTR = "data-feedback-ui";

/**
 * Svelte dev builds stamp every element with `__svelte_meta`: the element's own
 * source position, plus a `parent` stack of the component/block entries that
 * rendered it. Production builds strip it — the picker then falls back to
 * selector + text.
 */
interface DevStackEntry {
  type: string;
  file?: string;
  line: number;
  column: number;
  parent: DevStackEntry | null;
}
interface SvelteMeta {
  loc: { file: string; line: number; column: number };
  parent: DevStackEntry | null;
}

const metaOf = (el: Element | null): SvelteMeta | null =>
  ((el as unknown as { __svelte_meta?: SvelteMeta | null } | null)?.__svelte_meta ?? null);

/** Nearest element (self or ancestor) that carries Svelte source metadata. */
export function sourcedElement(el: Element): Element | null {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    if (metaOf(cur)) return cur;
  }
  return null;
}

export function sourceOf(el: Element): FeedbackSourceLoc | null {
  const meta = metaOf(sourcedElement(el));
  if (!meta) return null;
  return { file: toRepoPath(meta.loc.file), line: meta.loc.line, column: meta.loc.column };
}

/** Component render chain, innermost first — where each enclosing `<Component>` tag sits. */
export function chainOf(el: Element, max = 8): FeedbackChainEntry[] {
  const out: FeedbackChainEntry[] = [];
  for (let e = metaOf(sourcedElement(el))?.parent ?? null; e && out.length < max; e = e.parent) {
    // SvelteKit's generated root and library internals are noise for a reviewer.
    if (e.type !== "component" || !e.file || /\.svelte-kit\/|node_modules\//.test(e.file)) continue;
    const entry = { type: e.type, file: toRepoPath(e.file), line: e.line, column: e.column };
    const last = out.at(-1);
    if (!last || last.file !== entry.file || last.line !== entry.line) out.push(entry);
  }
  return out;
}

/**
 * Readable short path: route files keep their route (`routes/clients/+page.svelte`,
 * since every page is `+page.svelte`); everything else is the bare file name.
 */
export function shortPath(file: string): string {
  const at = file.indexOf("src/routes/");
  if (at >= 0) return file.slice(at + 4);
  return file.split("/").pop() ?? file;
}

/** Short human label for the picker tooltip: `SessionCard.svelte:42`. */
export function sourceLabel(el: Element): string {
  const src = sourceOf(el);
  if (!src) return `<${el.tagName.toLowerCase()}>`;
  return `${shortPath(src.file)}:${src.line}`;
}

const cssEscape = (s: string) =>
  typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(s) : s.replace(/[^\w-]/g, "\\$&");

/** Selector path up to the nearest id or `main`, with classes and nth-of-type. */
export function cssPath(el: Element, maxDepth = 6): string {
  const parts: string[] = [];
  for (let cur: Element | null = el; cur && parts.length < maxDepth; cur = cur.parentElement) {
    if (cur.id) {
      parts.unshift(`#${cssEscape(cur.id)}`);
      break;
    }
    const tag = cur.tagName.toLowerCase();
    if (tag === "main" || tag === "body") {
      parts.unshift(tag);
      break;
    }
    // Svelte scoping classes (svelte-xyz) are build noise.
    const classes = [...cur.classList].filter((c) => !c.startsWith("svelte-")).slice(0, 2);
    let part = tag + classes.map((c) => `.${cssEscape(c)}`).join("");
    const parent = cur.parentElement;
    if (parent) {
      const same = [...parent.children].filter((c) => c.tagName === cur!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
  }
  return parts.join(" > ");
}

const squash = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

/** Headings that introduce the element: page h1, then the nearest section/panel heading. */
export function headingsOf(el: Element): string[] {
  const found: string[] = [];
  const pageTitle = document.querySelector("main h1");
  for (let cur: Element | null = el; cur && cur !== document.body; cur = cur.parentElement) {
    const own = cur.matches("h1,h2,h3,h4") ? cur : cur.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > header h1, :scope > header h2, :scope > header h3, :scope > h4");
    if (own && own !== pageTitle) {
      const text = squash(own.textContent, 80);
      if (text && !found.includes(text)) found.unshift(text);
    }
    if (found.length >= 2) break;
  }
  const page = squash(pageTitle?.textContent, 80);
  if (page && !found.includes(page)) found.unshift(page);
  return found;
}

/** outerHTML minus Svelte scoping classes and inline SVG paths, capped. */
export function htmlOf(el: Element, max = 2000): string {
  const html = el.outerHTML
    .replace(/\s?svelte-[a-z0-9]+/g, "")
    .replace(/ class=""/g, "")
    .replace(/<path [^>]*>(<\/path>)?/g, "")
    .replace(/<!---->/g, "");
  return html.length > max ? `${html.slice(0, max)}… [truncated]` : html;
}

/** The element's visible text as captured on a feedback item (squashed, capped). */
export const textOf = (el: Element): string => squash((el as HTMLElement).innerText ?? el.textContent, 300);

export interface PageInfo {
  path: string;
  routeId: string | null;
  params: Record<string, string>;
  data: unknown;
}

export function buildContext(el: Element, page: PageInfo, appVersion: string): FeedbackContext {
  const r = el.getBoundingClientRect();
  return {
    route: { path: page.path, id: page.routeId, params: page.params },
    target: {
      source: sourceOf(el),
      chain: chainOf(el),
      tag: el.tagName.toLowerCase(),
      text: textOf(el),
      html: htmlOf(el),
      headings: headingsOf(el),
      selector: cssPath(el),
      rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
    },
    pageData: snapshotJson(page.data),
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    userAgent: navigator.userAgent,
    appVersion,
  };
}

/** True when the node belongs to the feedback UI (never pickable, never screenshotted). */
export const isFeedbackUi = (node: Node | null): boolean =>
  node instanceof Element && node.closest(`[${FEEDBACK_UI_ATTR}]`) !== null;
