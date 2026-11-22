import { z } from "zod";
import { cardioIssues } from "./cardio";
import { CardioPrescription } from "./domain";

/**
 * Built-in cardio templates. Read-only and versioned with the code like the
 * scheme presets: every trainer sees them, can hide one (account setting) or
 * save their own. Picking one copies its prescription into the session —
 * the session never points back at a live template.
 */

export interface CardioTemplatePreset {
  key: string;
  name: string;
  /** One plain line: what it's for. */
  summary: string;
  /** The modality is left for the session; only the shape is preset. */
  prescription: Omit<CardioPrescription, "modality">;
}

export const CARDIO_TEMPLATE_PRESETS: readonly CardioTemplatePreset[] = [
  {
    key: "easy-zone2",
    name: "Easy / Zone 2",
    summary: "Conversational pace that builds the aerobic base. Should feel easy all the way.",
    prescription: { durationMin: 40, hrZone: 2, targetRpe: 3 },
  },
  {
    key: "tempo-threshold",
    name: "Tempo / Threshold",
    summary: "Comfortably hard, sustained work near threshold, between an easy warm-up and cool-down.",
    prescription: {
      // the whole session averages out below the 20-minute block's effort
      targetRpe: 6,
      intervals: [
        { id: "warmup", type: "warmup", repeat: 1, durationSec: 600, hrZone: 2 },
        { id: "tempo", type: "work", repeat: 1, durationSec: 1200, hrZone: 4, rpe: 7 },
        { id: "cooldown", type: "cooldown", repeat: 1, durationSec: 300, hrZone: 1 },
      ],
    },
  },
  {
    key: "intervals",
    name: "Intervals",
    summary: "Hard repeats with easy recovery between them, for speed and VO₂max.",
    prescription: {
      // the reps are hard (8); with the easy work between them the session rates about 7
      targetRpe: 7,
      intervals: [
        { id: "warmup", type: "warmup", repeat: 1, durationSec: 600, hrZone: 2 },
        {
          id: "reps",
          type: "work",
          repeat: 4,
          durationSec: 180,
          // zone 4: a 3-minute rep never settles into zone 5, heart rate lags the effort
          hrZone: 4,
          rpe: 8,
          notes: "Go by effort; HR lags in short reps.",
          recovery: { type: "active_recovery", durationSec: 180 },
        },
        { id: "cooldown", type: "cooldown", repeat: 1, durationSec: 300, hrZone: 1 },
      ],
    },
  },
  {
    key: "long-endurance",
    name: "Long / Endurance",
    summary: "The week's longest session at an easy, steady effort.",
    prescription: { durationMin: 60, hrZone: 2, targetRpe: 4 },
  },
  {
    key: "continuous",
    name: "Continuous",
    summary: "One steady effort at a moderate pace.",
    prescription: { durationMin: 30, hrZone: 3, targetRpe: 4 },
  },
  {
    key: "custom",
    name: "Custom",
    summary: "Start from a blank session and build your own targets or intervals.",
    prescription: { durationMin: 30 },
  },
];

export const cardioTemplatePreset = (key: string | null | undefined): CardioTemplatePreset | null =>
  CARDIO_TEMPLATE_PRESETS.find((p) => p.key === key) ?? null;

/** A fresh prescription from a template: deep-copied, with the session's modality and the template stamped. */
export function fromCardioTemplate(
  template: { key?: string; id?: string; prescription: Omit<CardioPrescription, "modality"> & { modality?: string } },
  modality: string
): CardioPrescription {
  const rx = structuredClone(template.prescription);
  return { ...rx, modality, templateId: template.id ?? template.key };
}

/** A trainer-saved template's prescription (the `prescription` jsonb): the modality is optional, a workload is not. */
export const CardioTemplatePrescription = CardioPrescription.extend({
  modality: CardioPrescription.shape.modality.optional(),
}).superRefine((rx, ctx) => {
  for (const message of cardioIssues(rx)) ctx.addIssue({ code: "custom", message });
});
export type CardioTemplatePrescription = z.infer<typeof CardioTemplatePrescription>;
