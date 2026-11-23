import { describe, expect, test } from "bun:test";
import { feedbackLift } from "./lift";

const VW = 1280;
const VH = 800;

describe("feedbackLift", () => {
  test("a full-width bar over the pill lifts it 16px above the bar's top", () => {
    // the program save bar: 56px tall, 12px off the bottom, spanning the content column
    const bar = { left: 276, top: VH - 12 - 56, right: 1240, bottom: VH - 12 };
    expect(feedbackLift(bar, VW, VH)).toBe(VH - bar.top);
  });

  test("a bar that stops short of the pill leaves it alone", () => {
    // the chat composer beside the draft pane: bottom left, far from the pill
    expect(feedbackLift({ left: 289, top: 626, right: 749, bottom: 788 }, VW, VH)).toBe(0);
  });

  test("a bar scrolled below the viewport, or well above the pill, leaves it alone", () => {
    expect(feedbackLift({ left: 0, top: VH + 10, right: VW, bottom: VH + 66 }, VW, VH)).toBe(0);
    expect(feedbackLift({ left: 0, top: 300, right: VW, bottom: 356 }, VW, VH)).toBe(0);
  });

  test("a phone dock stuck to the bottom edge lifts the pill above it", () => {
    const bar = { left: 0, top: 640, right: 390, bottom: 800 };
    expect(feedbackLift(bar, 390, VH)).toBe(160);
  });
});
