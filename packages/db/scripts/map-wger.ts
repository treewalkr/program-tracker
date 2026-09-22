import type { Equipment, MuscleGroup } from "@pt/shared";

export type MuscleGroupValue = MuscleGroup;
export type EquipmentValue = Equipment;

interface Mapping {
  keywords: string[];
  value: string;
}

/** Order matters: first match wins. */
const MUSCLE_MAPPINGS: Mapping[] = [
  { keywords: ["biceps femoris"], value: "hamstrings" },
  { keywords: ["hamstring"], value: "hamstrings" },
  { keywords: ["biceps"], value: "biceps" },
  { keywords: ["triceps"], value: "triceps" },
  { keywords: ["pector", "chest"], value: "chest" },
  { keywords: ["deltoid", "shoulder"], value: "shoulders" },
  { keywords: ["latissimus", "lats"], value: "back" },
  { keywords: ["trapezius", "traps", "neck"], value: "traps" },
  { keywords: ["glut"], value: "glutes" },
  { keywords: ["quadriceps", "quad"], value: "quads" },
  { keywords: ["adductor"], value: "quads" },
  { keywords: ["abductor"], value: "glutes" },
  { keywords: ["calf", "calves", "sura"], value: "calves" },
  { keywords: ["forearm", "brachioradialis"], value: "forearms" },
  { keywords: ["lower back", "erector", "upper back", "back"], value: "back" },
  { keywords: ["abs", "abdom", "core", "serrat", "oblique", "iliopsoas", "hip flexor"], value: "core" },
];

const EQUIPMENT_MAPPINGS: Mapping[] = [
  { keywords: ["barbell", "sz-bar"], value: "barbell" },
  { keywords: ["dumbbell"], value: "dumbbell" },
  { keywords: ["kettlebell"], value: "kettlebell" },
  { keywords: ["machine"], value: "machine" },
  { keywords: ["cable"], value: "cable" },
  { keywords: ["band"], value: "band" },
  { keywords: ["plate"], value: "plate_loaded" },
  { keywords: ["bodyweight"], value: "bodyweight" },
];

function mapByKeywords(name: string, mappings: Mapping[]): string | null {
  const lower = name.toLowerCase();
  for (const m of mappings) {
    if (m.keywords.some((k) => lower.includes(k))) return m.value;
  }
  return null;
}

export function mapMuscle(wgerName: string): MuscleGroupValue | null {
  return (mapByKeywords(wgerName, MUSCLE_MAPPINGS) as MuscleGroupValue) ?? null;
}

export function mapEquipment(wgerName: string): EquipmentValue | null {
  return (mapByKeywords(wgerName, EQUIPMENT_MAPPINGS) ?? "other") as EquipmentValue | null;
}

export interface WgerExercise {
  id: number;
  name: string | null;
  muscles: number[];
  muscles_secondary: number[];
  equipment: number[];
}
