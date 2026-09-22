/**
 * Seed the global exercise library from the open-source WGER API (CC-BY-SA).
 * Data: https://wger.de — attribution requirement satisfied by keeping this
 * notice and the README credit.
 *
 * WGER keeps exercise metadata (muscles/equipment) and translated names in
 * separate endpoints; we join them here.
 *
 * Idempotent: skips exercises whose lowercase name already exists.
 * Run: bun run seed:exercises
 */
import { db, exercises } from "../src";
import type { MuscleGroupValue, EquipmentValue } from "./map-wger";
import { mapMuscle, mapEquipment, type WgerExercise } from "./map-wger";

const API = "https://wger.de/api/v2";

async function fetchAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${API}${path}?${new URLSearchParams({ format: "json", ...params })}`;
  while (url) {
    const res = await fetch(url, { headers: { "user-agent": "program-tracker/seed" } });
    if (!res.ok) throw new Error(`wger ${path} failed: ${res.status}`);
    const json = (await res.json()) as { next: string | null; results: T[] };
    out.push(...json.results);
    url = json.next;
  }
  return out;
}

interface WgerMuscle {
  id: number;
  name: string;
}
interface WgerEquipment {
  id: number;
  name: string;
}
interface WgerTranslation {
  name: string;
  exercise: number;
  language: number;
}

const run = async () => {
  console.log("fetching wger muscle + equipment catalogs…");
  const [muscles, equipment] = await Promise.all([
    fetchAll<WgerMuscle>("/muscle", { limit: "100" }),
    fetchAll<WgerEquipment>("/equipment", { limit: "100" }),
  ]);
  const muscleById = new Map(muscles.map((m) => [m.id, m.name]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e.name]));

  console.log("fetching exercises + english translations…");
  const [raw, translations] = await Promise.all([
    fetchAll<WgerExercise>("/exercise", { limit: "100" }),
    fetchAll<WgerTranslation>("/exercise-translation", { language: "2", limit: "100" }),
  ]);
  console.log(`fetched ${raw.length} exercises, ${translations.length} translations`);

  const nameByExerciseId = new Map<number, string>();
  for (const tr of translations) {
    if (!nameByExerciseId.has(tr.exercise)) nameByExerciseId.set(tr.exercise, (tr.name ?? "").trim());
  }

  const existing = new Set((await db.select().from(exercises)).map((e) => e.name.toLowerCase()));

  let inserted = 0;
  let skippedUnmapped = 0;
  for (const ex of raw) {
    const name = nameByExerciseId.get(ex.id) ?? "";
    if (name.length < 3) continue;
    if (existing.has(name.toLowerCase())) continue;

    const mapped = (ex.muscles ?? []).map((id) => mapMuscle(muscleById.get(id) ?? "")).filter(Boolean);
    if (mapped.length === 0) {
      skippedUnmapped++;
      continue;
    }
    const secondary = (ex.muscles_secondary ?? [])
      .map((id) => mapMuscle(muscleById.get(id) ?? ""))
      .filter(Boolean)
      .slice(0, 4);

    const equip: EquipmentValue =
      (ex.equipment ?? [])
        .map((id) => mapEquipment(equipmentById.get(id) ?? ""))
        .find(Boolean) ?? "bodyweight";

    await db.insert(exercises).values({
      trainerId: null,
      name,
      primaryMuscleGroup: mapped[0] as MuscleGroupValue,
      secondaryMuscleGroups: secondary,
      equipment: equip,
    });
    existing.add(name.toLowerCase());
    inserted++;
  }

  console.log(`✓ seeded ${inserted} exercises (skipped ${skippedUnmapped} without a mappable muscle)`);
  process.exit(0);
};

run().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
