import { describe, expect, test } from "bun:test";
import {
  SESSION_TYPE_NAME_MAX,
  SESSION_TYPE_PRESETS,
  SESSION_TYPE_TAXONOMY,
  groupSessionTypes,
  isPresetKey,
  kindForType,
  presetByKey,
  presetParent,
  sessionTypePath,
  typeFitsKind,
} from "./sessionTypes";

describe("session type taxonomy", () => {
  test("main types in order, each with its sub-types", () => {
    expect(SESSION_TYPE_TAXONOMY.map((m) => [m.name, m.format, m.subs.map((s) => s.name)])).toEqual([
      ["Cardiovascular", "cardio", ["Aerobic base", "Anaerobic endurance", "Anaerobic power"]],
      ["Strength training", "lifting", ["Stability & mobility", "Functional movement", "Loaded strength", "Performance"]],
      ["Metabolic", "any", ["Circuit", "AMRAP"]],
    ]);
  });

  test("presets flatten main then subs; subs inherit the format", () => {
    expect(SESSION_TYPE_PRESETS).toHaveLength(12);
    expect(SESSION_TYPE_PRESETS.slice(0, 2)).toEqual([
      { key: "cardiovascular", name: "Cardiovascular", format: "cardio", parent: null },
      { key: "cardiovascular.aerobic-base", name: "Aerobic base", format: "cardio", parent: "cardiovascular" },
    ]);
    for (const p of SESSION_TYPE_PRESETS) {
      if (p.parent) expect(presetByKey(p.parent)?.format).toBe(p.format);
      expect(p.name.length).toBeLessThanOrEqual(SESSION_TYPE_NAME_MAX);
    }
  });

  test("keys and names are unique (names case-insensitively)", () => {
    const keys = SESSION_TYPE_PRESETS.map((p) => p.key);
    const names = SESSION_TYPE_PRESETS.map((p) => p.name.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(names).size).toBe(names.length);
  });

  test("helpers", () => {
    expect(isPresetKey("metabolic.amrap")).toBe(true);
    expect(isPresetKey("metabolic.nope")).toBe(false);
    expect(isPresetKey(null)).toBe(false);
    expect(presetParent("metabolic.amrap")?.name).toBe("Metabolic");
    expect(presetParent("metabolic")).toBeNull();
    expect(presetParent(undefined)).toBeNull();
    expect(sessionTypePath({ name: "AMRAP", presetKey: "metabolic.amrap" })).toBe("Metabolic › AMRAP");
    expect(sessionTypePath({ name: "Metabolic", presetKey: "metabolic" })).toBe("Metabolic");
    expect(sessionTypePath({ name: "Hypertrophy", presetKey: null })).toBe("Hypertrophy");
  });

  test("format fits kind; any fits both and keeps the session's kind", () => {
    expect(typeFitsKind("lifting", "lifting")).toBe(true);
    expect(typeFitsKind("lifting", "cardio")).toBe(false);
    expect(typeFitsKind("any", "cardio")).toBe(true);
    expect(typeFitsKind("any", "lifting")).toBe(true);
    expect(kindForType("cardio", "lifting")).toBe("cardio");
    expect(kindForType("any", "cardio")).toBe("cardio");
  });
});

describe("groupSessionTypes", () => {
  const row = (name: string, presetKey: string | null = null) => ({ id: name, name, format: "lifting" as const, presetKey });

  test("taxonomy order regardless of list order, custom last in list order", () => {
    const types = [
      row("Hypertrophy"),
      row("AMRAP", "metabolic.amrap"),
      row("Aerobic base", "cardiovascular.aerobic-base"),
      row("Metabolic", "metabolic"),
      row("Circuit", "metabolic.circuit"),
      row("Plyo"),
      row("Cardiovascular", "cardiovascular"),
    ];
    const { groups, custom } = groupSessionTypes(types);
    expect(groups.map((g) => [g.main.name, g.row?.name ?? null, g.subs.map((s) => s.name)])).toEqual([
      ["Cardiovascular", "Cardiovascular", ["Aerobic base"]],
      ["Metabolic", "Metabolic", ["Circuit", "AMRAP"]],
    ]);
    expect(custom.map((t) => t.name)).toEqual(["Hypertrophy", "Plyo"]);
  });

  test("a group without its main row keeps its subs; an unknown key counts as custom", () => {
    const { groups, custom } = groupSessionTypes([row("Performance", "strength-training.performance"), row("Old", "gone")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].row).toBeNull();
    expect(groups[0].subs.map((s) => s.name)).toEqual(["Performance"]);
    expect(custom.map((t) => t.name)).toEqual(["Old"]);
  });
});
