import type { FeedbackContext, FeedbackSourceLoc } from "@pt/shared";
import { anchorSelector, sourceOf, textOf } from "./capture";

type Target = FeedbackContext["target"];

const sameLoc = (a: FeedbackSourceLoc | null, b: FeedbackSourceLoc) =>
  !!a && a.file === b.file && a.line === b.line && a.column === b.column;

function query(root: ParentNode, selector: string): Element[] {
  try {
    return [...root.querySelectorAll(selector)];
  } catch {
    // Old items may carry a selector this browser rejects.
    return [];
  }
}

/**
 * The element under the item's stable anchor whose tag and visible text match,
 * or null. `depth` 0 means the anchor is the element itself; otherwise it's an
 * ancestor and the element is among its descendants of the same tag.
 */
function viaAnchor(root: ParentNode, target: Target): Element | null {
  const a = target.anchor;
  if (!a) return null;
  for (const host of query(root, anchorSelector(a))) {
    const cands =
      a.depth === 0
        ? [host].filter((el) => el.tagName.toLowerCase() === target.tag)
        : query(host, target.tag);
    const hit = target.text ? cands.find((el) => textOf(el) === target.text) : cands.length === 1 ? cands[0] : undefined;
    if (hit) return hit;
  }
  return null;
}

/**
 * Finds the element a feedback item is about on the current page, or null.
 * Shared by feedback-mode pins and "Show me".
 *
 * The stable anchor (id / data-* / aria-label / name, recorded since it
 * existed) plus the visible text is tried first: it survives production
 * builds, which have no source metadata. Then candidates are the selector hits — narrowed to the ones rendered by the same
 * source line when the build has dev metadata — or, if the selector misses,
 * every element rendered by that source line. Rows of a list share one source
 * line, so the visible text decides between them. Without a text match:
 * - an item with no visible text (an input, an icon) takes a lone candidate;
 * - `loose` ("Show me", on the very page the item was filed on, where text
 *   drifts with the data) takes the first candidate of the same tag.
 * Pins stay strict: on another client's page, a near miss is a different thing.
 */
export function locateTarget(
  target: Target,
  { root = document, loose = false }: { root?: ParentNode; loose?: boolean } = {},
): Element | null {
  const anchored = viaAnchor(root, target);
  if (anchored) return anchored;
  const src = target.source;
  const fromSource = (els: Element[]) => (src ? els.filter((el) => sameLoc(sourceOf(el), src)) : []);
  const hits = query(root, target.selector);
  let cands = fromSource(hits);
  if (cands.length === 0) cands = hits.length ? hits : fromSource(query(root, target.tag));
  if (target.text) {
    const byText = cands.find((el) => textOf(el) === target.text);
    if (byText) return byText;
  } else if (cands.length === 1) {
    return cands[0];
  }
  if (loose) return cands.find((el) => el.tagName.toLowerCase() === target.tag) ?? null;
  return null;
}
