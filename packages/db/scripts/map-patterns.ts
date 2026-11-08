import type { FunctionalMovement, MovementPattern } from "@pt/shared";

export interface PatternMatch {
  movementPattern: MovementPattern | null;
  functionalMovement: FunctionalMovement | null;
}

interface PatternRule {
  keywords: string[];
  movementPattern: MovementPattern | null;
  functionalMovement: FunctionalMovement | null;
}

const PATTERN_RULES: PatternRule[] = [
  {
    keywords: ["nordic"],
    movementPattern: "knee_dominant",
    functionalMovement: null,
  },
  {
    keywords: ["carry", "farmer", "yoke"],
    movementPattern: "carry",
    functionalMovement: "locomotion",
  },
  {
    keywords: ["curl", "lateral raise", "front raise", "calf raise", "triceps extension", "pushdown", "triceps kickback"],
    movementPattern: "isolation",
    functionalMovement: null,
  },
  {
    keywords: ["upright row"],
    movementPattern: "vertical_pull",
    functionalMovement: "pull",
  },
  {
    keywords: [
      "bench press",
      "chest press",
      "incline press",
      "decline press",
      "incline bench",
      "decline bench",
      "push-up",
      "pushup",
      "push up",
      "chest fly",
      "pec fly",
      "pec deck",
    ],
    movementPattern: "horizontal_push",
    functionalMovement: "push",
  },
  {
    keywords: [
      "overhead press",
      "shoulder press",
      "military press",
      "push press",
      "jerk",
      "handstand",
      "arnold press",
      "dip",
    ],
    movementPattern: "vertical_push",
    functionalMovement: "push",
  },
  {
    keywords: [
      "pull-up",
      "pullup",
      "pull up",
      "chin-up",
      "chinup",
      "chin up",
      "pulldown",
      "pull-down",
    ],
    movementPattern: "vertical_pull",
    functionalMovement: "pull",
  },
  {
    keywords: [
      "row",
      "face pull",
      "rear delt",
      "reverse fly",
      "reverse pec deck",
      "shrug",
    ],
    movementPattern: "horizontal_pull",
    functionalMovement: "pull",
  },
  {
    keywords: [
      "split squat",
      "bulgarian",
      "pistol",
      "single-leg",
      "single leg",
      "step-up",
      "step up",
      "lunge",
    ],
    movementPattern: "knee_dominant",
    functionalMovement: "single_leg",
  },
  {
    keywords: ["squat", "leg press", "leg extension"],
    movementPattern: "knee_dominant",
    functionalMovement: "squat",
  },
  {
    keywords: [
      "deadlift",
      "rdl",
      "good morning",
      "back extension",
      "hyperextension",
      "hip thrust",
      "glute bridge",
      "bridge",
      "pull-through",
      "pull through",
      "hip raise",
      "kickback",
    ],
    movementPattern: "hip_dominant",
    functionalMovement: "bend_lift",
  },
  {
    keywords: ["suitcase"],
    movementPattern: "anti_lateral_flexion",
    functionalMovement: "locomotion",
  },
  {
    keywords: ["side plank"],
    movementPattern: "anti_lateral_flexion",
    functionalMovement: null,
  },
  {
    keywords: ["side bend"],
    movementPattern: "lateral_flexion",
    functionalMovement: null,
  },
  {
    keywords: ["pallof"],
    movementPattern: "anti_rotation",
    functionalMovement: "rotation",
  },
  {
    keywords: ["twist", "chop", "wood chop"],
    movementPattern: "rotation",
    functionalMovement: "rotation",
  },
  {
    keywords: [
      "leg raise",
      "knee raise",
      "crunch",
      "sit-up",
      "situp",
      "toes to bar",
      "hanging",
    ],
    movementPattern: "trunk_flexion",
    functionalMovement: null,
  },
  {
    keywords: ["plank", "rollout", "ab wheel"],
    movementPattern: "anti_extension",
    functionalMovement: null,
  },
  {
    keywords: ["sled push"],
    movementPattern: "horizontal_push",
    functionalMovement: "locomotion",
  },
  {
    keywords: ["sled"],
    movementPattern: "horizontal_pull",
    functionalMovement: "locomotion",
  },
  {
    keywords: ["run", "sprint", "jog", "jump rope", "skipping", "burpee"],
    movementPattern: null,
    functionalMovement: "locomotion",
  },
];

export function classifyExercise(name: string): PatternMatch {
  const lower = name.toLowerCase();
  for (const rule of PATTERN_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) {
      return {
        movementPattern: rule.movementPattern,
        functionalMovement: rule.functionalMovement,
      };
    }
  }
  return { movementPattern: null, functionalMovement: null };
}
