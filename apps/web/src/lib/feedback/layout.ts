import type { FeedbackAttachment } from "@pt/shared";

/** One slot of an edited ticket's image list, as `PATCH /v1/feedback/:id/content` takes it. */
export type ImageSlot = { keep: string } | { upload: number };

/** What `editLayout` needs of a tray entry. */
export interface LayoutEntry {
  file: File | null;
  stored?: Pick<FeedbackAttachment, "id" | "kind">;
}

/**
 * A composer's images as an edit: stored images kept by id, new files by
 * their index in `images`, in the order shown. Removed images are simply
 * absent; files still compressing are left out.
 */
export function editLayout(entries: LayoutEntry[]): { layout: ImageSlot[]; images: File[] } {
  const images: File[] = [];
  const layout = entries.flatMap((e): ImageSlot[] => {
    if (e.stored) return [{ keep: e.stored.id }];
    if (!e.file) return [];
    images.push(e.file);
    return [{ upload: images.length - 1 }];
  });
  return { layout, images };
}

/** The pin composer's width on a wide screen; at or under `PIN_SHEET_MAX` it spans the screen. */
export const PIN_W = 340;
export const PIN_SHEET_MAX = 720;
const GAP = 8;

export interface PinPlace {
  left: number;
  top: number;
  width: number;
  /** The pin scrolls inside past this, so Send and Cancel always stay on screen. */
  maxHeight: number;
}

/**
 * Where the Feedback pin composer goes for a picked element: below it, else
 * above it, else against whichever edge has more room, always inside the
 * viewport and clear of the Feedback bar (`floor`, the bar's top edge).
 * `height` is the pin's rendered height; on a phone it spans the screen.
 */
export function placePin(
  target: { top: number; bottom: number; left: number },
  height: number,
  view: { width: number; height: number; floor?: number },
): PinPlace {
  const floor = Math.min(view.floor ?? view.height, view.height);
  const width = view.width <= PIN_SHEET_MAX ? view.width - 2 * GAP : Math.min(PIN_W, view.width - 2 * GAP);
  const left = Math.min(Math.max(GAP, target.left), view.width - width - GAP);
  const maxHeight = Math.max(0, floor - 2 * GAP);
  const h = Math.min(height, maxHeight);
  const below = target.bottom + GAP;
  const above = target.top - GAP - h;
  let top: number;
  if (below + h <= floor - GAP) top = below;
  else if (above >= GAP) top = above;
  else top = floor - target.bottom >= target.top ? floor - GAP - h : GAP;
  return { left, top: Math.max(GAP, top), width, maxHeight };
}
