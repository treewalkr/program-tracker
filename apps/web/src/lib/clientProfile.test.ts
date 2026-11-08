import { expect, test } from "bun:test";
import { emailError, emptyProfile, nameError, profileFromClient, profileKey, profilePayload, stackNote } from "./clientProfile";

test("payload trims text, sorts days and nulls an absent cardio target", () => {
  const f = { ...emptyProfile(), goals: "  Squat 140 ", limitations: "   ", trainingDays: [5, 1], sessionsPerWeek: "4" as unknown as number };
  expect(profilePayload(f)).toEqual({ goals: "Squat 140", limitations: null, sessionsPerWeek: 4, trainingDays: [1, 5], cardioTarget: null, cardioDays: null, longRunDay: null, oneRepMaxes: null });
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

test("run days sort and an empty set means the lifting days (null); the long run day passes through", () => {
  const f = { ...emptyProfile(), cardioDays: [7, 3], longRunDay: 7 };
  expect(profilePayload(f)).toMatchObject({ cardioDays: [3, 7], longRunDay: 7 });
  expect(profilePayload(emptyProfile())).toMatchObject({ cardioDays: null, longRunDay: null });
});

test("profileFromClient reads run days and the long run day", () => {
  const c = { id: "c", name: "P", email: "p@x.io", status: "active" as const, goals: null, limitations: null, sessionsPerWeek: 2, cardioDays: [3, 7], longRunDay: 7 };
  expect(profileFromClient(c)).toMatchObject({ cardioDays: [3, 7], longRunDay: 7 });
  expect(profileFromClient({ ...c, cardioDays: null, longRunDay: null })).toMatchObject({ cardioDays: [], longRunDay: null });
});

test("1RM rows become exerciseId → { kg, date }; incomplete rows drop out; none = null", () => {
  const f = {
    ...emptyProfile(),
    oneRepMaxes: [
      { exerciseId: "sq", kg: "140" as unknown as number, date: "2026-10-01" },
      { exerciseId: "", kg: 100, date: "2026-10-01" },
      { exerciseId: "bp", kg: null, date: "2026-10-01" },
      { exerciseId: "dl", kg: 180, date: "" },
    ],
  };
  expect(profilePayload(f).oneRepMaxes).toEqual({ sq: { kg: 140, date: "2026-10-01" } });
  expect(profilePayload(emptyProfile()).oneRepMaxes).toBeNull();
});

test("profileFromClient lists the client's 1RMs as editable rows", () => {
  const c = { id: "c", name: "P", email: "p@x.io", status: "active" as const, goals: null, limitations: null, sessionsPerWeek: 2, oneRepMaxes: { sq: { kg: 140, date: "2026-10-01" } } };
  expect(profileFromClient(c).oneRepMaxes).toEqual([{ exerciseId: "sq", kg: 140, date: "2026-10-01" }]);
  expect(profileFromClient({ ...c, oneRepMaxes: null }).oneRepMaxes).toEqual([]);
});
