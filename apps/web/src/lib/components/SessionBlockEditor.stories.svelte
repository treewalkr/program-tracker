<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import SessionBlockEditor from "./SessionBlockEditor.svelte";
  import type { ExerciseDto, ProgramSessionDto } from "$lib/api/types";

  const { Story } = defineMeta({
    title: "Domain/SessionBlockEditor",
    component: SessionBlockEditor,
    parameters: {
      docs: {
        description: {
          component: "Session block editor supporting lifting and cardio sessions, name/kind/notes editing, and reordering.",
        },
      },
    },
  });
</script>

<script lang="ts">
  const catalog: ExerciseDto[] = [
    { id: "ex-squat", name: "Back Squat", primaryMuscleGroup: "quads", secondaryMuscleGroups: [], equipment: "barbell", movementPattern: "knee_dominant", functionalMovement: "squat" },
    { id: "ex-bench", name: "Bench Press", primaryMuscleGroup: "chest", secondaryMuscleGroups: [], equipment: "barbell", movementPattern: "horizontal_push", functionalMovement: "push" },
    { id: "ex-rdl", name: "Romanian Deadlift", primaryMuscleGroup: "hamstrings", secondaryMuscleGroups: [], equipment: "barbell", movementPattern: "hip_dominant", functionalMovement: "bend_lift" },
  ];

  let liftingSession = $state<ProgramSessionDto>({
    id: "ps-1",
    name: "Day 1 — Lower Strength",
    order: 0,
    kind: "lifting",
    notes: "Rest 3 min between heavy squat sets",
    exercises: [
      {
        id: "pe-1",
        exerciseId: "ex-squat",
        exerciseName: "Back Squat",
        role: "primary",
        order: 0,
        prescribedSets: [
          { setNumber: 1, type: "working", reps: 5, targetRpe: 8, restSeconds: 180, targetWeightKg: 100, amrap: false },
          { setNumber: 2, type: "working", reps: 5, targetRpe: 8, restSeconds: 180, targetWeightKg: 100, amrap: false },
        ],
      },
      {
        id: "pe-2",
        exerciseId: "ex-rdl",
        exerciseName: "Romanian Deadlift",
        role: "strength",
        order: 1,
        prescribedSets: [
          { setNumber: 1, type: "working", reps: 8, targetRpe: 7, restSeconds: 120, targetWeightKg: 80, amrap: false },
        ],
      },
    ],
  });

  let cardioSession = $state<ProgramSessionDto>({
    id: "ps-2",
    name: "Cardio Recovery",
    order: 1,
    kind: "cardio",
    notes: "Nasal breathing only",
    exercises: [],
    cardio: {
      modality: "Stationary Bike",
      durationMin: 45,
      hrZone: 2,
      intensity: "Easy conversational pace",
      distanceKm: 20,
      targetRpe: 4,
    },
  });
</script>

<Story name="Lifting Session" asChild>
  <SessionBlockEditor
    bind:session={liftingSession}
    {catalog}
    canMoveUp={false}
    canMoveDown={true}
    onmoveup={() => alert("move up")}
    onmovedown={() => alert("move down")}
    onremove={() => alert("remove")}
  />
</Story>

<Story name="Cardio Session" asChild>
  <SessionBlockEditor
    bind:session={cardioSession}
    {catalog}
    canMoveUp={true}
    canMoveDown={false}
    onmoveup={() => alert("move up")}
    onmovedown={() => alert("move down")}
    onremove={() => alert("remove")}
  />
</Story>
