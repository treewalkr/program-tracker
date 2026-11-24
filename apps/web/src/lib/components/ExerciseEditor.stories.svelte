<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ExerciseEditor from './ExerciseEditor.svelte';
  import { exercises as catalog } from '$lib/api/mock/data';
  import type { PrescribedSetDto, ProgramExerciseDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Components/ExerciseEditor',
    component: ExerciseEditor,
    parameters: {
      docs: {
        description: {
          component:
            "One exercise's prescription in the program editors. On a phone the one-row table wraps into rows of three; a per-set table scrolls sideways with a fading edge, and on touch each set's × is a 40 px target so a near miss on Rest doesn't remove a set.",
        },
      },
    },
  });

  const set = (setNumber: number, reps = 8): PrescribedSetDto => ({
    setNumber, type: 'working', reps, amrap: false, targetWeightKg: null, targetRpe: 8, restSeconds: 150,
  });
  const ex = (sets: PrescribedSetDto[]): ProgramExerciseDto => ({
    id: 'pe-1', exerciseId: catalog[0].id, exerciseName: catalog[0].name, order: 0, prescribedSets: sets,
  });
  const noop = () => {};
</script>

<Story name="One row" asChild>
  <div style="max-width: 560px;">
    <ExerciseEditor exercise={ex([1, 2, 3].map((n) => set(n)))} {catalog} canMoveUp={false} canMoveDown onmoveup={noop} onmovedown={noop} onremove={noop} />
  </div>
</Story>

<!-- iPhone SE inside a session: the per-set table scrolls (edge fade), × stays a finger-size target. -->
<Story name="Per set · 288 px" asChild>
  <div style="width: 288px;">
    <ExerciseEditor exercise={ex([set(1, 10), set(2, 8), set(3, 6)])} {catalog} canMoveUp={false} canMoveDown onmoveup={noop} onmovedown={noop} onremove={noop} />
  </div>
</Story>
