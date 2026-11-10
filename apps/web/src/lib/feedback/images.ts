import {
  FEEDBACK_IMAGE_MAX_SIDE,
  FEEDBACK_IMAGE_MIMES,
  FEEDBACK_MAX_IMAGE_BYTES,
  FEEDBACK_MAX_IMAGES,
} from "@pt/shared";

/**
 * Images attached to feedback are re-encoded in the browser before upload:
 * webp, longest side at most FEEDBACK_IMAGE_MAX_SIDE, under
 * FEEDBACK_MAX_IMAGE_BYTES. The server checks the same limits again.
 */

/** A refusal the composer shows as-is. */
export class ImageRefused extends Error {}

/** Scales (w, h) down so neither side exceeds `max`; never scales up. */
export function fitWithin(width: number, height: number, max = FEEDBACK_IMAGE_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const isAcceptedType = (type: string) => (FEEDBACK_IMAGE_MIMES as readonly string[]).includes(type);

/**
 * Which of `incoming` fit next to `existing` already-attached images: wrong
 * types are dropped, and the rest are cut at the limit. `refused` explains
 * whatever didn't make it, for the composer to show.
 */
export function admit(existing: number, incoming: File[], max = FEEDBACK_MAX_IMAGES) {
  const images = incoming.filter((f) => isAcceptedType(f.type));
  const wrongType = incoming.length - images.length;
  const room = Math.max(0, max - existing);
  const accepted = images.slice(0, room);
  const overflow = images.length - accepted.length;
  const reasons: string[] = [];
  if (wrongType) reasons.push(wrongType === 1 ? "That file isn't a PNG, JPEG or WebP image." : `${wrongType} files weren't PNG, JPEG or WebP images.`);
  if (overflow) {
    reasons.push(
      room === 0
        ? `You can attach up to ${max} images — remove one to add another.`
        : `You can attach up to ${max} images — added the first ${room}, left out ${overflow}.`,
    );
  }
  return { accepted, refused: reasons.length ? reasons.join(" ") : null };
}

/** The two halves of re-encoding, swappable in tests. */
export interface ImageCodec {
  decode(blob: Blob): Promise<{ width: number; height: number; source: CanvasImageSource; close?: () => void }>;
  /** Draws `source` at (width, height) and encodes it; browsers without webp encoding hand back PNG. */
  encode(source: CanvasImageSource, width: number, height: number, type: string, quality: number): Promise<Blob>;
}

export const browserCodec: ImageCodec = {
  async decode(blob) {
    const bmp = await createImageBitmap(blob);
    return { width: bmp.width, height: bmp.height, source: bmp, close: () => bmp.close() };
  },
  async encode(source, width, height, type, quality) {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d canvas");
      ctx.drawImage(source, 0, 0, width, height);
      return canvas.convertToBlob({ type, quality });
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d canvas");
    ctx.drawImage(source, 0, 0, width, height);
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), type, quality),
    );
  },
};

/** Tried in order until the image fits under the byte limit. */
const QUALITIES = [0.86, 0.72, 0.58, 0.44];

const baseName = (name: string) => (name && name !== "blob" ? name.replace(/\.[^.]+$/, "") : "image");

/**
 * Re-encodes one image for upload. Webp where the browser can encode it,
 * JPEG where it can't (Safari's canvas returns PNG for a webp request).
 * Throws ImageRefused for a wrong type, an unreadable file or one that stays
 * over the limit at the lowest quality.
 */
export async function compressImage(
  blob: Blob,
  { codec = browserCodec, name = (blob as File).name ?? "", maxBytes = FEEDBACK_MAX_IMAGE_BYTES } = {},
): Promise<File> {
  const label = name && name !== "blob" ? `"${name}"` : "That image";
  if (!isAcceptedType(blob.type)) throw new ImageRefused(`${label} isn't a PNG, JPEG or WebP image.`);
  let img: Awaited<ReturnType<ImageCodec["decode"]>>;
  try {
    img = await codec.decode(blob);
  } catch {
    throw new ImageRefused(`${label} couldn't be read as an image.`);
  }
  try {
    const size = fitWithin(img.width, img.height);
    let type = "image/webp";
    for (const quality of QUALITIES) {
      let out = await codec.encode(img.source, size.width, size.height, type, quality);
      if (out.type !== type) {
        type = "image/jpeg";
        out = await codec.encode(img.source, size.width, size.height, type, quality);
      }
      if (out.size <= maxBytes) {
        return new File([out], `${baseName(name)}.${type === "image/webp" ? "webp" : "jpg"}`, { type });
      }
    }
    throw new ImageRefused(`${label} is too detailed to fit under ${maxBytes / 1024 / 1024} MB, even compressed.`);
  } finally {
    img.close?.();
  }
}

/** `data:image/…;base64,…` (a screen capture) → Blob. */
export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}
