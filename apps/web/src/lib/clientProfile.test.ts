import { expect, test } from "bun:test";
import { emailError, emptyProfile, nameError, profileKey, profilePayload, stackNote } from "./clientProfile";

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

test("stack note states the real count", () => {
  expect(stackNote(3, 3)).toBeNull();
  expect(stackNote(3, 0)).toBeNull();
  expect(stackNote(4, 3)).toBe("1 day will hold two sessions");
  expect(stackNote(4, 2)).toBe("2 days will hold two sessions");
  expect(stackNote(5, 2)).toBe("2 days will hold more than one session — up to 3 on one day");
});

test("identity errors name what to fix", () => {
  expect(nameError("  ")).toBe("Enter the client's name");
  expect(nameError("Ada")).toBeNull();
  expect(emailError("")).toBe("Enter the client's email");
  expect(emailError("test@")).toBe("Enter a full email, like ada@gym.com");
  expect(emailError(" ada@gym.com ")).toBeNull();
});
