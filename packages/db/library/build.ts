/**
 * Builds exercise-library.json from the pinned free-exercise-db snapshot plus
 * the hand curation in ./curation.ts. Deterministic; re-run after editing the
 * curation: `bun run library:build`. Verified by library.test.ts.
 */
import { writeFileSync } from "node:fs";
import type { Equipment, FunctionalMovement, MovementPattern, MuscleGroup } from "@pt/shared";
import { OVERRIDES, RENAME, SOURCE_URL, SUPPLEMENT, type LibraryEntry } from "./curation";

interface SourceExercise {
  name: string;
  category: string;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
}

const MUSCLE: Record<string, MuscleGroup> = {
  abdominals: "core",
  abductors: "glutes",
  adductors: "quads",
  biceps: "biceps",
  calves: "calves",
  chest: "chest",
  forearms: "forearms",
  glutes: "glutes",
  hamstrings: "hamstrings",
  lats: "back",
  "lower back": "back",
  "middle back": "back",
  neck: "traps",
  quadriceps: "quads",
  shoulders: "shoulders",
  traps: "traps",
  triceps: "triceps",
};

const SOURCE_EQUIPMENT: Record<string, Equipment> = {
  barbell: "barbell",
  "e-z curl bar": "barbell",
  dumbbell: "dumbbell",
  kettlebells: "kettlebell",
  cable: "cable",
  machine: "machine",
  bands: "band",
  "body only": "bodyweight",
  "medicine ball": "other",
  "exercise ball": "other",
};

/** Name hints that beat the source's equipment field. */
const FORCED_EQUIPMENT: [RegExp, Equipment][] = [
  [/smith machine/i, "machine"],
  [/plate-loaded/i, "plate_loaded"],
  [/landmine|trap bar|t-bar|ez-bar|axle/i, "barbell"],
  [/suspension trainer|jump rope|outdoor cycling/i, "other"],
];
/** Name hints used when the source says "other" or nothing. */
const FALLBACK_EQUIPMENT: [RegExp, Equipment][] = [
  [/barbell/i, "barbell"],
  [/kettlebell/i, "kettlebell"],
  [/dumbbell/i, "dumbbell"],
  [/cable/i, "cable"],
  [/\bband/i, "band"],
  [/pull-up|chin-up|dip\b|muscle-up|inverted row|push-up|lunge|jump|hop|bound|squat|mountain climber|carioca|skipping|butt kicks|plank|sit-up|crunch|leg raise|trail run/i, "bodyweight"],
];

type Rule = [string[], MovementPattern | null, FunctionalMovement | null];

/** First match on the lowercased final name wins. Order matters. */
const RULES: Rule[] = [
  [["glute kickback"], "hip_dominant", "bend_lift"],
  [["leg curl", "nordic", "glute ham"], "hip_dominant", "bend_lift"],
  [["jerk dip"], "knee_dominant", "squat"],
  [["pike push-up"], "vertical_push", "push"],
  [["dip"], "vertical_push", "push"],
  // Isolation: no pattern fits honestly.
  [
    [
      "curl", "triceps", "skull crusher", "tate press", "jm press", "lateral raise", "front raise", "lateral-to-front",
      "scaption", "cuban press", "external rotation", "internal rotation", "calf", "wrist", "pronation", "supination",
      "neck harness", "neck extension", "neck flexion", "plate pinch", "hip adduction", "hip abduction", "hip flexion", "monster walk", "halo", "figure 8",
      "bent press", "turkish get-up", "battle rope", "bottoms-up clean", "medicine ball overhead throw",
    ],
    null,
    null,
  ],
  [
    [
      "treadmill", "stationary bike", "outdoor cycling", "recumbent", "elliptical", "stair climber", "rowing machine",
      "trail run", "jump rope", "skipping", "carioca", "butt kicks", "sled sprint", "sled drag", "bear crawl",
      "mountain climber", "box shuffle",
    ],
    null,
    "locomotion",
  ],
  [["carry", "yoke"], null, "locomotion"],
  [["sled push"], "horizontal_push", "locomotion"],
  [["sled row"], "horizontal_pull", "pull"],
  // Core
  [["pallof"], "anti_rotation", "rotation"],
  [["twist", "woodchop", "cable lift", "landmine rotation", "scoop toss"], "rotation", "rotation"],
  [["side bend", "windmill"], "lateral_flexion", null],
  [["side plank"], "anti_lateral_flexion", null],
  [["plank", "rollout", "dead bug", "fallout", "bird dog", "hollow"], "anti_trunk_flexion", null],
  [["crunch", "sit-up", "v-up", "leg raise", "knee raise", "knee tuck", "pike", "heel touch", "toes-to-bar", "slam"], "trunk_flexion", null],
  // Lower
  [["suitcase deadlift"], "hip_dominant", "bend_lift"],
  [["single-leg deadlift", "single-leg romanian", "single-leg glute bridge", "single-leg hip"], "hip_dominant", "single_leg"],
  [["clean and jerk", "clean and press"], "hip_dominant", "bend_lift"],
  [["snatch balance", "overhead squat"], "knee_dominant", "squat"],
  [["thruster"], "knee_dominant", "squat"],
  [
    [
      "jerk", "push press", "log press", "bradford", "behind-the-neck press", "overhead press", "shoulder press",
      "arnold", "handstand", "landmine jammer", "kettlebell press", "seesaw press", "kettlebell seated press",
    ],
    "vertical_push",
    "push",
  ],
  [["clean", "snatch", "high pull", "swing", "atlas stone", "sandbag load", "tire flip", "backward throw"], "hip_dominant", "bend_lift"],
  [
    [
      "deadlift", "romanian", "stiff-leg", "good morning", "rack pull", "back extension", "reverse hyperextension",
      "hip thrust", "glute bridge", "hip bridge", "pull-through", "hip extension",
    ],
    "hip_dominant",
    "bend_lift",
  ],
  [
    [
      "box jump", "jump squat", "tuck jump", "depth jump", "broad jump", "star jump", "bench jump", "split jump",
      "hurdle hops", "cone hop", "lateral bound", "diagonal bound", "single-leg hop", "lateral hop",
    ],
    "knee_dominant",
    "locomotion",
  ],
  [
    ["split squat", "bulgarian", "lunge", "step-up", "pistol", "single-leg box squat", "single-leg leg extension", "skater", "cossack"],
    "knee_dominant",
    "single_leg",
  ],
  [["squat", "leg press", "leg extension"], "knee_dominant", "squat"],
  // Upper
  [["upright row"], "vertical_pull", "pull"],
  [["reverse fly", "rear delt", "face pull", "pull-apart", "reverse pec deck"], "horizontal_pull", "pull"],
  [["pull-up", "chin-up", "pulldown", "muscle-up", "rope climb", "pullover"], "vertical_pull", "pull"],
  [["row", "shrug"], "horizontal_pull", "pull"],
  [
    [
      "bench press", "chest press", "floor press", "push-up", "fly", "crossover", "svend", "guillotine", "pin press",
      "board press", "dumbbell press", "ez-bar press", "chest pass",
    ],
    "horizontal_push",
    "push",
  ],
];

/** Full Olympic / kettlebell lifts load the whole chain. */
const FULL_BODY = /\b(clean|snatch)\b/i;
const NOT_FULL_BODY = /balance|deadlift|pull|bottoms-up/i;

export function classify(name: string): { movementPattern: MovementPattern | null; functionalMovement: FunctionalMovement | null } {
  const lower = name.toLowerCase();
  for (const [keys, movementPattern, functionalMovement] of RULES) {
    if (keys.some((k) => lower.includes(k))) return { movementPattern, functionalMovement };
  }
  return { movementPattern: null, functionalMovement: null };
}

function equipmentFor(name: string, source: string | null): Equipment {
  for (const [re, eq] of FORCED_EQUIPMENT) if (re.test(name)) return eq;
  const mapped = source ? SOURCE_EQUIPMENT[source] : undefined;
  if (mapped) return mapped;
  for (const [re, eq] of FALLBACK_EQUIPMENT) if (re.test(name)) return eq;
  return "other";
}

export function buildLibrary(source: SourceExercise[]): LibraryEntry[] {
  const known = new Set(source.map((s) => s.name));
  const unknown = Object.keys(RENAME).filter((k) => !known.has(k));
  if (unknown.length) throw new Error(`RENAME keys not in source: ${unknown.join(", ")}`);

  const out: LibraryEntry[] = [];
  for (const s of source) {
    if (s.category === "stretching" || s.equipment === "foam roll") continue;
    const renamed = s.name in RENAME ? RENAME[s.name] : s.name;
    if (renamed === null) continue;
    const name = renamed;

    const primary: MuscleGroup =
      s.category === "cardio"
        ? "cardio"
        : FULL_BODY.test(name) && !NOT_FULL_BODY.test(name)
          ? "full_body"
          : MUSCLE[s.primaryMuscles[0]];
    if (!primary) throw new Error(`no muscle mapping for ${s.name}: ${s.primaryMuscles[0]}`);
    const secondary = [...new Set([...s.primaryMuscles.slice(1), ...s.secondaryMuscles].map((m) => MUSCLE[m]))]
      .filter((m): m is MuscleGroup => !!m && m !== primary)
      .slice(0, 4);

    out.push({
      name,
      primaryMuscleGroup: primary,
      secondaryMuscleGroups: secondary,
      equipment: equipmentFor(name, s.equipment),
      ...classify(name),
      ...OVERRIDES[name],
    });
  }

  const names = new Set(out.map((x) => x.name));
  const unusedOverrides = Object.keys(OVERRIDES).filter((k) => !names.has(k));
  if (unusedOverrides.length) throw new Error(`OVERRIDES for missing names: ${unusedOverrides.join(", ")}`);

  return [...out, ...SUPPLEMENT].sort((a, b) => a.name.localeCompare(b.name));
}

if (import.meta.main) {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`source fetch failed: ${res.status}`);
  const lib = buildLibrary((await res.json()) as SourceExercise[]);
  const path = new URL("./exercise-library.json", import.meta.url).pathname;
  writeFileSync(path, `[\n${lib.map((x) => `  ${JSON.stringify(x)}`).join(",\n")}\n]\n`);
  console.log(`✓ wrote ${lib.length} exercises → ${path}`);
}
