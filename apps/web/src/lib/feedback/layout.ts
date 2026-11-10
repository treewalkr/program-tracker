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
