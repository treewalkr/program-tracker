import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import type { CardioInterval } from "@pt/shared";
import IntervalBuilder, { timeline, totalsLine } from "./IntervalBuilder.svelte";
import { workloadLine } from "./CardioPrescriptionEditor.svelte";

const mockup: CardioInterval[] = [
  { id: "w", type: "warmup", repeat: 1, durationSec: 600, hrZone: 2 },
  { id: "r", type: "work", repeat: 5, durationSec: 120, hrZone: 4, recovery: { type: "active_recovery", durationSec: 120 } },
  { id: "c", type: "cooldown", repeat: 1, durationSec: 300 },
];

describe("IntervalBuilder totals", () => {
  test("the mockup session: 33:00, work 10:00, recovery 8:00 — recoveries between reps only", () => {
    expect(totalsLine(mockup)).toBe("Total 33:00 · work 10:00 · recovery 8:00");
    const parts = timeline(mockup);
    expect(parts.filter((p) => p.kind === "work")).toHaveLength(5);
    expect(parts.filter((p) => p.kind === "recovery")).toHaveLength(4);
    expect(parts.at(-2)?.kind).toBe("work");
  });

  test("a recovery after the last rep counts once more", () => {
    const after = mockup.map((iv) => (iv.type === "work" ? { ...iv, recoveryAfterLast: true } : iv));
    expect(totalsLine(after)).toBe("Total 35:00 · work 10:00 · recovery 10:00");
  });

  test("a distance-only interval leaves the time unknown, never guessed", () => {
    const line = totalsLine([...mockup, { id: "d", type: "work", repeat: 1, distanceM: 1600 }]);
    expect(line).toContain("Total time unknown");
    expect(line).toContain("1.6 km");
  });

  test("renders a row per interval with bpm from the member's zones", () => {
    const zones = [1, 2, 3, 4, 5].map((z) => ({ zone: z, min: 110 + z * 13, max: 122 + z * 13 }));
    const { body } = render(IntervalBuilder, { props: { intervals: mockup, zones } });
    expect(body).toContain("162–174 bpm".replace("162–174", `${zones[3].min}–${zones[3].max}`));
    expect(body).toContain("Total 33:00");
  });
});

test("workloadLine: the issues line before saving", () => {
  expect(workloadLine({ modality: "Running", intervals: mockup })).toEqual({ ok: true, text: "Has a workload (33:00)." });
  expect(workloadLine({ modality: "Running" }).ok).toBe(false);
});
