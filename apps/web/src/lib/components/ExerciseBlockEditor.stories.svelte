<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ExerciseBlockEditor from "./ExerciseBlockEditor.svelte";
  import type { ExerciseDto, ProgramExerciseDto } from "$lib/api/types";
  import { addSet } from "@pt/shared";

  const { Story } = defineMeta({
    title: "Domain/ExerciseBlockEditor",
    component: ExerciseBlockEditor,
    parameters: {
      docs: {
        description: {
          component: "Exercise block editor with exercise/role pickers, notes, and sets list.",
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

  let sampleExercise = $state<ProgramExerciseDto>({
    id: "pe-1",
    exerciseId: "ex-squat",
    exerciseName: "Back Squat",
    role: "primary",
    order: 0,
    notes: "2s pause in the hole",
    prescribedSets: [
      { setNumber: 1, type: "working", reps: 5, targetRpe: 8, restSeconds: 180, targetWeightKg: 100, amrap: false },
      { setNumber: 2, type: "working", reps: 5, targetRpe: 8, restSeconds: 180, targetWeightKg: 100, amrap: false },
      { setNumber: 3, type: "backoff", reps: 8, targetRpe: 7, restSeconds: 120, targetWeightKg: 85, amrap: false },
    ],
  });

  let emptyExercise = $state<ProgramExerciseDto>({
    id: "pe-2",
    exerciseId: "ex-bench",
    exerciseName: "Bench Press",
    role: "primary",
    order: 1,
    prescribedSets: [],
  });
</script>

<Story name="With Sets" asChild>
  <ExerciseBlockEditor
    bind:exercise={sampleExercise}
    {catalog}
    canMoveUp={false}
    canMoveDown={true}
    onmoveup={() => alert("move up")}
    onmovedown={() => alert("move down")}
    onremove={() => alert("remove")}
    onaddset={() => {
      sampleExercise = addSet(sampleExercise);
    }}
  />
</Story>

<Story name="Empty Sets State" asChild>
  <ExerciseBlockEditor
    bind:exercise={emptyExercise}
    {catalog}
    canMoveUp={true}
    canMoveDown={false}
    onmoveup={() => alert("move up")}
    onmovedown={() => alert("move down")}
    onremove={() => alert("remove")}
    onaddset={() => {
      emptyExercise = addSet(emptyExercise);
    }}
  />
</Story>
