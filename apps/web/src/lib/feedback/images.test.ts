import { describe, expect, test } from "bun:test";
import { admit, compressImage, fitWithin, ImageRefused, type ImageCodec } from "./images";

const file = (type: string, name = "a") => new File([new Uint8Array(4)], name, { type });

/** Records each encode; output size shrinks with quality, type is what the "browser" supports. */
function fakeCodec(opts: { width: number; height: number; bytesAt: (q: number) => number; webp?: boolean; fail?: boolean }) {
  const calls: { width: number; height: number; type: string; quality: number }[] = [];
  let closed = false;
  const codec: ImageCodec = {
    async decode() {
      if (opts.fail) throw new Error("bad");
      return { width: opts.width, height: opts.height, source: {} as CanvasImageSource, close: () => (closed = true) };
    },
    async encode(_, width, height, type, quality) {
      calls.push({ width, height, type, quality });
      const out = type === "image/webp" && opts.webp === false ? "image/png" : type;
      return new Blob([new Uint8Array(opts.bytesAt(quality))], { type: out });
    },
  };
  return { codec, calls, closed: () => closed };
}

describe("fitWithin", () => {
  test("caps the longest side, keeping the ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(1000, 5000)).toEqual({ width: 400, height: 2000 });
  });
  test("never scales up", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("admit", () => {
  test("keeps images up to the limit and says what was left out", () => {
    const four = [file("image/png"), file("image/jpeg"), file("image/webp"), file("image/png")];
    const r = admit(4, four);
    expect(r.accepted).toHaveLength(2);
    expect(r.refused).toBe("You can attach up to 6 images — added the first 2, left out 2.");
    expect(admit(6, [file("image/png")])).toEqual({ accepted: [], refused: "You can attach up to 6 images — remove one to add another." });
  });
  test("drops other file types", () => {
    const r = admit(0, [file("image/gif"), file("application/pdf"), file("image/png")]);
    expect(r.accepted.map((f) => f.type)).toEqual(["image/png"]);
    expect(r.refused).toBe("2 files weren't PNG, JPEG or WebP images.");
    expect(admit(0, [file("image/png")]).refused).toBeNull();
  });
});

describe("compressImage", () => {
  test("re-encodes to webp at most 2000px on the longest side", async () => {
    const f = fakeCodec({ width: 3000, height: 1500, bytesAt: () => 1000 });
    const out = await compressImage(file("image/png", "screen.png"), { codec: f.codec });
    expect(out.type).toBe("image/webp");
    expect(out.name).toBe("screen.webp");
    expect(f.calls).toEqual([{ width: 2000, height: 1000, type: "image/webp", quality: 0.86 }]);
    expect(f.closed()).toBe(true);
  });

  test("steps the quality down until it fits", async () => {
    const f = fakeCodec({ width: 100, height: 100, bytesAt: (q) => (q > 0.6 ? 5000 : 900) });
    const out = await compressImage(file("image/jpeg"), { codec: f.codec, maxBytes: 1000 });
    expect(f.calls.map((c) => c.quality)).toEqual([0.86, 0.72, 0.58]);
    expect(out.size).toBe(900);
  });

  test("falls back to JPEG where the browser can't encode webp", async () => {
    const f = fakeCodec({ width: 10, height: 10, bytesAt: () => 10, webp: false });
    const out = await compressImage(file("image/png", "blob"), { codec: f.codec });
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("image.jpg");
  });

  test("refuses wrong types, unreadable files and images that never fit", async () => {
    const ok = fakeCodec({ width: 10, height: 10, bytesAt: () => 10 });
    await expect(compressImage(file("image/gif", "a.gif"), { codec: ok.codec })).rejects.toThrow(`"a.gif" isn't a PNG, JPEG or WebP image.`);
    const broken = fakeCodec({ width: 10, height: 10, bytesAt: () => 10, fail: true });
    await expect(compressImage(file("image/png"), { codec: broken.codec })).rejects.toBeInstanceOf(ImageRefused);
    const huge = fakeCodec({ width: 10, height: 10, bytesAt: () => 5000 });
    await expect(compressImage(file("image/png", "big.png"), { codec: huge.codec, maxBytes: 1000 })).rejects.toThrow("too detailed");
    expect(huge.closed()).toBe(true);
  });
});
