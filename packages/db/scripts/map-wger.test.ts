import { describe, expect, test } from "bun:test";
import { mapEquipment, mapMuscle } from "./map-wger";

describe("mapMuscle", () => {
  test("biceps femoris is a hamstring, not a biceps", () => {
    expect(mapMuscle("Biceps femoris")).toBe("hamstrings");
  });
  test("plain mappings", () => {
    expect(mapMuscle("Biceps")).toBe("biceps");
    expect(mapMuscle("Pectoralis major")).toBe("chest");
    expect(mapMuscle("Quadriceps femoris")).toBe("quads");
    expect(mapMuscle("Anterior deltoid")).toBe("shoulders");
    expect(mapMuscle("Latissimus dorsi")).toBe("back");
    expect(mapMuscle("Glutes")).toBe("glutes");
    expect(mapMuscle("Abs")).toBe("core");
    expect(mapMuscle("Calves")).toBe("calves");
  });
  test("unmapped returns null", () => {
    expect(mapMuscle("")).toBeNull();
    expect(mapMuscle("Zzz unknown")).toBeNull();
  });
});

describe("mapEquipment", () => {
  test("known equipment", () => {
    expect(mapEquipment("Barbell")).toBe("barbell");
    expect(mapEquipment("SZ-Bar")).toBe("barbell");
    expect(mapEquipment("Dumbbell")).toBe("dumbbell");
    expect(mapEquipment("Machine")).toBe("machine");
    expect(mapEquipment("Cable")).toBe("cable");
    expect(mapEquipment("Bands")).toBe("band");
    expect(mapEquipment("Weight plate")).toBe("plate_loaded");
  });
  test("unknown falls back to other, never null", () => {
    expect(mapEquipment("Stretch mat")).toBe("other");
    expect(mapEquipment("")).toBe("other");
  });
});
