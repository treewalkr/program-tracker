import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

describe("mock cardio module", () => {
  test("Nok's demo data: a reviewed log, a skipped one and one waiting, each with its plan snapshot", async () => {
    const logs = await mockApi.sessionLogs("cl-nok");
    const planned = logs.filter((l) => l.kind === "cardio" && l.prescription);
    expect(planned.some((l) => l.reviewedAt && l.trainerFeedback)).toBe(true);
    expect(planned.some((l) => l.cardio?.skipped)).toBe(true);
    const waiting = planned.find((l) => !l.reviewedAt && !l.cardio?.skipped && l.prescription?.session.cardio?.intervals?.length);
    expect(waiting?.prescription?.zonesBpm).toHaveLength(5);
  });

  test("a new log keeps the session as prescribed, with the bpm zones in effect that day", async () => {
    const program = await mockApi.program("pg-nok-a");
    const session = program.weeks[1].sessions.find((s) => s.kind === "cardio" && s.cardio?.intervals?.length)!;
    const saved = await mockApi.logSession({
      clientId: "cl-nok",
      programId: "pg-nok-a",
      programSessionId: session.id,
      date: new Date().toISOString().slice(0, 10),
      kind: "cardio",
      cardio: { modality: "Running", durationSec: 1980, rpe: 8 },
      onDuplicate: "add",
      sets: [],
    });
    expect(saved.prescription?.session.id).toBe(session.id);
    expect(saved.prescription?.hrProfileVersion).toBe(2);
    expect(saved.cardio?.durationMin).toBe(33);
    await mockApi.deleteSessionLog(saved.id);
  });

  test("a completed cardio log in seconds needs an RPE; a skipped one only its reason", async () => {
    const base = { clientId: "cl-nok", programId: "pg-nok-a", date: "2026-01-05", kind: "cardio" as const, sets: [] };
    await expect(mockApi.logSession({ ...base, cardio: { modality: "Running", durationSec: 600 } })).rejects.toThrow(/RPE/);
    const skipped = await mockApi.logSession({ ...base, cardio: { modality: "Running", skipped: { reason: "time" } } });
    await mockApi.deleteSessionLog(skipped.id);
  });

  test("review stamps the log and sets the feedback; clearing it unstamps", async () => {
    const log = (await mockApi.sessionLogs("cl-nok")).find((l) => l.kind === "cardio" && !l.reviewedAt && !l.cardio?.skipped)!;
    const r = await mockApi.reviewSessionLog(log.id, { reviewed: true, feedback: "  Good pacing.  " });
    expect(r.reviewedAt).not.toBeNull();
    expect(r.trainerFeedback).toBe("Good pacing.");
    const undone = await mockApi.reviewSessionLog(log.id, { reviewed: false });
    expect(undone.reviewedAt).toBeNull();
    expect(undone.trainerFeedback).toBe("Good pacing.");
  });

  test("HR profiles version up and the zones come from the method", async () => {
    const before = await mockApi.hrProfiles("cl-nok");
    const v = await mockApi.createHrProfile("cl-nok", { effectiveFrom: "2026-11-20", method: "karvonen", restingHr: 58, maxHr: 188 });
    expect(v.version).toBe(before.length + 1);
    expect(v.zones[0]).toEqual({ zone: 1, min: 123, max: 135 });
    await expect(mockApi.createHrProfile("cl-nok", { effectiveFrom: "2026-11-20", method: "lthr" })).rejects.toThrow();
  });

  test("assessments are computed from the inputs; Rockport without a sex is refused", async () => {
    const a = await mockApi.createAssessment("cl-nok", { protocol: "cooper_12min", testedOn: "2026-11-21", inputs: { distanceM: 2400 } });
    expect(a.result).toBe(42.4);
    await expect(
      mockApi.createAssessment("cl-priya", { protocol: "rockport_walk", testedOn: "2026-11-21", inputs: { timeSec: 900, heartRate: 140, weightKg: 60 } }),
    ).rejects.toThrow(/sex/);
    await mockApi.deleteAssessment("cl-nok", a.id);
  });

  test("modalities: presets lock, own ones edit and delete, names stay unique", async () => {
    const all = await mockApi.modalities();
    expect(all.find((m) => m.presetKey === "running")?.usedIn).toBeGreaterThan(0);
    await expect(mockApi.patchModality("md-running", { name: "Jogging" })).rejects.toThrow();
    const own = await mockApi.createModality({ name: "Swimming", metric: "none" });
    await expect(mockApi.createModality({ name: "swimming", metric: "none" })).rejects.toThrow();
    await mockApi.deleteModality(own.id);
  });

  test("templates: hide a preset, save and archive your own", async () => {
    expect(await mockApi.setCardioPresetHidden("long-endurance", true)).toEqual(["long-endurance"]);
    const t = await mockApi.createCardioTemplate({ name: "Fartlek", prescription: { durationMin: 30, targetRpe: 6 } });
    await expect(mockApi.createCardioTemplate({ name: "Empty", prescription: {} })).rejects.toThrow();
    const archived = await mockApi.patchCardioTemplate(t.id, { archived: true });
    expect(archived.archivedAt).not.toBeNull();
    const list = await mockApi.cardioTemplates();
    expect(list.presets.find((p) => p.key === "long-endurance")?.hidden).toBe(true);
    await mockApi.deleteCardioTemplate(t.id);
    await mockApi.setCardioPresetHidden("long-endurance", false);
  });

  test("display units default to metric and save", async () => {
    expect(await mockApi.displayUnits()).toEqual({ weight: "kg", distance: "km" });
    expect(await mockApi.setDisplayUnits({ weight: "lb", distance: "mi" })).toEqual({ weight: "lb", distance: "mi" });
    await mockApi.setDisplayUnits({ weight: "kg", distance: "km" });
  });
});
