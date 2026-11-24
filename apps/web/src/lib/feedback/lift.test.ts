import { describe, expect, test } from "bun:test";
import { feedbackLift, pillHome } from "./lift";

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

describe("feedbackLift against a measured pill", () => {
  test("the wide phone bar is lifted by a bar anywhere along it", () => {
    // iPhone 13: the active bar spans 8..382; a save bar on the left half only
    const pill = pillHome(390, 664, { width: 374, height: 76 }, 8);
    expect(feedbackLift({ left: 16, top: 560, right: 180, bottom: 620 }, 390, 664, pill)).toBe(664 - 560);
  });

  test("a panel or dialog reaching the top half never lifts the pill off screen", () => {
    // a full-height inspector docked right, or a modal backdrop
    expect(feedbackLift({ left: 800, top: 0, right: VW, bottom: VH }, VW, VH)).toBe(0);
    expect(feedbackLift({ left: 0, top: 300, right: VW, bottom: VH }, VW, VH)).toBe(0);
  });

  test("iPad portrait: the member save bar under the pill lifts it", () => {
    // 834 × 1194, sticky .savebar 12px off the bottom, 60px tall, across the content column
    expect(feedbackLift({ left: 300, top: 1122, right: 810, bottom: 1182 }, 834, 1194)).toBe(1194 - 1122);
  });
});
