import { describe, expect, test } from "bun:test";
import { watchSeen } from "./seen";

/** A stand-in IntersectionObserver the test drives by hand. */
function fakeObserver() {
  let fire: IntersectionObserverCallback = () => {};
  let disconnected = false;
  class Fake {
    constructor(cb: IntersectionObserverCallback) {
      fire = cb;
    }
    observe() {}
    disconnect() {
      disconnected = true;
    }
  }
  const show = (isIntersecting: boolean) =>
    fire([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  return { Observer: Fake, show, disconnected: () => disconnected };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const node = {} as Element;

describe("watchSeen", () => {
  test("a card that stays on screen counts as seen once", async () => {
    const o = fakeObserver();
    let seen = 0;
    watchSeen(node, () => seen++, { dwellMs: 20, Observer: o.Observer });
    o.show(true);
    await wait(40);
    expect(seen).toBe(1);
    expect(o.disconnected()).toBe(true);
  });

  test("scrolling past it (a jump to another ticket) doesn't", async () => {
    const o = fakeObserver();
    let seen = 0;
    watchSeen(node, () => seen++, { dwellMs: 20, Observer: o.Observer });
    o.show(true);
    await wait(5);
    o.show(false);
    await wait(40);
    expect(seen).toBe(0);
  });

  test("stopping cancels a pending mark", async () => {
    const o = fakeObserver();
    let seen = 0;
    const stop = watchSeen(node, () => seen++, { dwellMs: 20, Observer: o.Observer });
    o.show(true);
    stop();
    await wait(40);
    expect(seen).toBe(0);
  });
});
