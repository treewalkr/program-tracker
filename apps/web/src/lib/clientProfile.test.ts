import { expect, test } from "bun:test";
import { emptyProfile, profileKey, profilePayload } from "./clientProfile";

test("payload trims text, sorts days and nulls an absent cardio target", () => {
  const f = { ...emptyProfile(), goals: "  Squat 140 ", limitations: "   ", trainingDays: [5, 1], sessionsPerWeek: "4" as unknown as number };
  expect(profilePayload(f)).toEqual({ goals: "Squat 140", limitations: null, sessionsPerWeek: 4, trainingDays: [1, 5], cardioTarget: null });
});

test("cardio target carries unit and numeric value", () => {
  const f = { ...emptyProfile(), cardioUnit: "minutes" as const, cardioValue: "150" as unknown as number };
  expect(profilePayload(f).cardioTarget).toEqual({ unit: "minutes", value: 150 });
});

test("whitespace-only edits are not dirty", () => {
  expect(profileKey({ ...emptyProfile(), goals: "a " })).toBe(profileKey({ ...emptyProfile(), goals: "a" }));
});
