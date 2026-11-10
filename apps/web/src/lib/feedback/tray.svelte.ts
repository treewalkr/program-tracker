import { FEEDBACK_MAX_IMAGES, type FeedbackAttachment } from "@pt/shared";
import { admit, compressImage, ImageRefused } from "./images";
import { editLayout } from "./layout";

export interface TrayImage {
  id: number;
  /** Re-encoded, ready to upload; null while it's still being compressed, and for a stored image. */
  file: File | null;
  /** Object URL of the original for the thumbnail (shown at once, before compression), or a stored image's URL. */
  preview: string;
  name: string;
  /** An image the ticket already has (editing): kept by id, never re-uploaded. */
  stored?: Pick<FeedbackAttachment, "id" | "kind">;
}

/** A captured screenshot (element or page): kept or removed, but outside the upload limit. */
const captured = (i: TrayImage) => i.stored !== undefined && i.stored.kind !== "upload";

let seq = 0;

/**
 * The images waiting in one composer: added by paste, drop or the file
 * picker, compressed on arrival, reorderable and removable until sent.
 * `AttachmentInput` renders it; the composer form attaches `zone` to take
 * pastes and drops anywhere on it.
 */
export class ImageTray {
  images = $state<TrayImage[]>([]);
  /** Why the last add (or send) fell short; cleared by the next change. */
  error = $state<string | null>(null);
  /** A file drag is over the composer. */
  dragging = $state(false);
  /** Announced to screen readers after a move or removal. */
  status = $state("");
  readonly max: number;

  constructor(max = FEEDBACK_MAX_IMAGES) {
    this.max = max;
  }

  get busy() {
    return this.images.some((i) => !i.file && !i.stored);
  }
  /** Images that count toward the limit: everything but captured screenshots. */
  get counted() {
    return this.images.filter((i) => !captured(i)).length;
  }
  get full() {
    return this.counted >= this.max;
  }
  /** The files to upload, in order. */
  get files(): File[] {
    return this.images.flatMap((i) => (i.file ? [i.file] : []));
  }

  /** The tray as an edit of a ticket's images (see `editLayout`). */
  get layout() {
    return editLayout(this.images);
  }

  /** Starts the tray from images a ticket already has (`url` gives each one's address). */
  seed(list: FeedbackAttachment[], url: (a: FeedbackAttachment) => string, name: (a: FeedbackAttachment, n: number) => string) {
    this.clear();
    this.images = list.map((a, n) => ({
      id: ++seq,
      file: null,
      preview: url(a),
      name: name(a, n + 1),
      stored: { id: a.id, kind: a.kind },
    }));
  }

  add(incoming: File[]) {
    if (!incoming.length) return;
    const { accepted, refused } = admit(this.counted, incoming, this.max);
    this.error = refused;
    for (const original of accepted) {
      const entry: TrayImage = { id: ++seq, file: null, preview: URL.createObjectURL(original), name: original.name };
      this.images.push(entry);
      compressImage(original)
        .then((file) => {
          const i = this.images.find((x) => x.id === entry.id);
          if (i) i.file = file;
        })
        .catch((err) => {
          this.drop(entry.id);
          this.error = err instanceof ImageRefused ? err.message : `Couldn't attach ${original.name || "that image"}.`;
        });
    }
    if (accepted.length) this.status = `${accepted.length} image${accepted.length === 1 ? "" : "s"} attached.`;
  }

  remove(id: number) {
    const at = this.images.findIndex((i) => i.id === id);
    if (at < 0) return;
    this.drop(id);
    this.error = null;
    this.status = `Image ${at + 1} removed. ${this.images.length} left.`;
  }

  /** Moves an image by `by` places (clamped). Returns its new index. */
  move(id: number, by: number): number {
    const from = this.images.findIndex((i) => i.id === id);
    if (from < 0) return -1;
    const to = Math.min(this.images.length - 1, Math.max(0, from + by));
    if (to === from) return from;
    const [item] = this.images.splice(from, 1);
    this.images.splice(to, 0, item);
    this.status = `Image moved to position ${to + 1} of ${this.images.length}.`;
    return to;
  }

  clear() {
    for (const i of this.images) if (!i.stored) URL.revokeObjectURL(i.preview);
    this.images = [];
    this.error = null;
    this.status = "";
  }

  private drop(id: number) {
    const i = this.images.find((x) => x.id === id);
    if (i && !i.stored) URL.revokeObjectURL(i.preview);
    this.images = this.images.filter((x) => x.id !== id);
  }

  /**
   * Svelte attachment for the composer: pasted images and dropped files land
   * in the tray. Text pastes are left alone.
   */
  zone = (node: HTMLElement) => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const onpaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      this.add(files);
    };
    const ondragover = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      this.dragging = true;
    };
    const ondragleave = (e: DragEvent) => {
      if (!node.contains(e.relatedTarget as Node | null)) this.dragging = false;
    };
    const ondrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      this.dragging = false;
      this.add([...(e.dataTransfer?.files ?? [])]);
    };
    node.addEventListener("paste", onpaste);
    node.addEventListener("dragover", ondragover);
    node.addEventListener("dragleave", ondragleave);
    node.addEventListener("drop", ondrop);
    return () => {
      node.removeEventListener("paste", onpaste);
      node.removeEventListener("dragover", ondragover);
      node.removeEventListener("dragleave", ondragleave);
      node.removeEventListener("drop", ondrop);
    };
  };
}
