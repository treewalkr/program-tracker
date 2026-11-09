import { expect, test } from "bun:test";
import {
  basicsInvalid,
  basicsSummary,
  birthDateError,
  bodyweightError,
  emailError,
  emptyProfile,
  heightError,
  nameError,
  phonePayload,
  profileFromClient,
  profileKey,
  profilePayload,
  stackNote,
  weekSummary,
  hasCardio,
  startedOnError,
} from "./clientProfile";

test("payload trims text, sorts days and nulls an absent cardio target", () => {
  const f = { ...emptyProfile("2026-11-08"), goals: "  Squat 140 ", limitations: "   ", trainingDays: [5, 1], sessionsPerWeek: "4" as unknown as number };
  expect(profilePayload(f)).toEqual({
    goals: "Squat 140",
    limitations: null,
    sessionsPerWeek: 4,
    trainingDays: [1, 5],
    cardioTarget: null,
    cardioDays: null,
    longRunDay: null,
    oneRepMaxes: null,
    experience: null,
    birthDate: null,
    sex: null,
    bodyweightKg: null,
    heightCm: null,
    startedOn: "2026-11-08",
  });
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
  expect(emailError("")).toBeNull();
  expect(emailError("   ")).toBeNull();
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

test("1RM dates revived by the API client stay YYYY-MM-DD and survive a re-save", () => {
  const base = { id: "c", name: "P", email: "p@x.io", status: "active" as const, goals: null, limitations: null, sessionsPerWeek: 2 };
  for (const date of ["2026-11-08T00:00:00.000Z", new Date("2026-11-08T00:00:00.000Z")] as unknown as string[]) {
    const f = profileFromClient({ ...base, oneRepMaxes: { sq: { kg: 140, date } } });
    expect(f.oneRepMaxes).toEqual([{ exerciseId: "sq", kg: 140, date: "2026-11-08" }]);
    expect(profilePayload(f).oneRepMaxes).toEqual({ sq: { kg: 140, date: "2026-11-08" } });
  }
});

test("a new profile starts the client today; basics start unset", () => {
  expect(emptyProfile("2026-11-08")).toMatchObject({ experience: "", birthDate: "", sex: "", bodyweightKg: null, heightCm: null, startedOn: "2026-11-08" });
});

test("basics round-trip; dates stay calendar days even when revived into Dates", () => {
  const client = {
    id: "c1",
    name: "Ada",
    email: null,
    status: "active" as const,
    goals: null,
    limitations: null,
    sessionsPerWeek: 3,
    experience: "intermediate" as const,
    birthDate: new Date("1992-03-14T00:00:00.000Z") as unknown as string,
    sex: "female" as const,
    bodyweightKg: 72.5,
    heightCm: 168,
    startedOn: "2026-01-05",
  };
  const f = profileFromClient(client);
  expect(f).toMatchObject({ experience: "intermediate", birthDate: "1992-03-14", sex: "female", bodyweightKg: 72.5, heightCm: 168, startedOn: "2026-01-05" });
  expect(profilePayload(f)).toMatchObject({ experience: "intermediate", birthDate: "1992-03-14", sex: "female", bodyweightKg: 72.5, heightCm: 168, startedOn: "2026-01-05" });
});

test("an existing client without a start date shows it empty, and empty basics save as null", () => {
  const f = profileFromClient({ id: "c1", name: "Ada", email: null, status: "active", goals: null, limitations: null, sessionsPerWeek: 3 });
  expect(f.startedOn).toBe("");
  const blank = { ...f, bodyweightKg: "" as unknown as number };
  expect(profilePayload(blank)).toMatchObject({ experience: null, birthDate: null, sex: null, bodyweightKg: null, heightCm: null, startedOn: null });
});

test("basics range errors match the API limits", () => {
  expect(bodyweightError(null)).toBeNull();
  expect(bodyweightError(72)).toBeNull();
  expect(bodyweightError(19)).toBe("Bodyweight must be 20–400 kg");
  expect(heightError(251)).toBe("Height must be 80–250 cm");
  expect(heightError(168)).toBeNull();
  expect(birthDateError("", "2026-11-08")).toBeNull();
  expect(birthDateError("2026-11-09", "2026-11-08")).not.toBeNull();
  expect(startedOnError("1999-12-31", "2026-11-08")).not.toBeNull();
  expect(basicsInvalid({ ...emptyProfile(), heightCm: 300 })).toBe(true);
  expect(basicsInvalid(emptyProfile())).toBe(false);
});

test("phone is trimmed; blank is null", () => {
  expect(phonePayload("  +66 81 234 5678 ")).toBe("+66 81 234 5678");
  expect(phonePayload("   ")).toBeNull();
});

test("header basics list only what's set", () => {
  const base = { id: "c1", name: "Ada", email: null, status: "active" as const, goals: null, limitations: null, sessionsPerWeek: 3 };
  expect(
    basicsSummary({ ...base, experience: "intermediate", birthDate: "1992-03-14", sex: "female", bodyweightKg: 72, heightCm: 168 }, "2026-11-08")
  ).toEqual(["Intermediate", "34 yrs", "Female", "72 kg"]);
  expect(basicsSummary({ ...base, sex: "male" }, "2026-11-08")).toEqual(["Male"]);
  expect(basicsSummary(base, "2026-11-08")).toEqual([]);
});

test("week summary reads the whole training week in one line", () => {
  const f = emptyProfile("2026-11-08");
  expect(weekSummary(f)).toBe("3 lifts, no fixed days");
  expect(weekSummary({ ...f, trainingDays: [5, 1, 3] })).toBe("3 lifts on Mon Wed Fri");
  expect(
    weekSummary({ ...f, trainingDays: [1, 3, 5], cardioDays: [6], longRunDay: 7, cardioUnit: "minutes", cardioValue: 120 })
  ).toBe("3 lifts on Mon Wed Fri · cardio on Sat · long session Sun · 120 minutes a week");
  expect(weekSummary({ ...f, sessionsPerWeek: 1, trainingDays: [2], cardioDays: [6, 4] })).toBe("1 lift on Tue · cardio on Thu Sat");
  expect(weekSummary({ ...f, cardioUnit: "sessions", cardioValue: 2 })).toBe("3 lifts, no fixed days · cardio on lifting days · 2 sessions a week");
});

test("week summary follows the cardio switch", () => {
  const f = emptyProfile("2026-11-08");
  expect(weekSummary(f, true)).toBe("3 lifts, no fixed days · cardio on lifting days");
  expect(weekSummary({ ...f, cardioDays: [6], longRunDay: 7 }, false)).toBe("3 lifts, no fixed days");
});

test("cardio counts as set by days, a long session or a target", () => {
  const f = emptyProfile("2026-11-08");
  expect(hasCardio(f)).toBe(false);
  expect(hasCardio({ ...f, cardioDays: [2] })).toBe(true);
  expect(hasCardio({ ...f, longRunDay: 7 })).toBe(true);
  expect(hasCardio({ ...f, cardioUnit: "zone_minutes" })).toBe(true);
});
