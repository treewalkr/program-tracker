<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SetChips from './SetChips.svelte';
  import type { PrescribedSetDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/SetChips',
    component: SetChips,
    parameters: {
      docs: {
        description: {
          component:
            'Coach notation: uniform sets collapse to `3×5 @RPE 6→8 · 180s`; an ascending RPE ramp reads as `min→max`; `@RPE` colored by effort tier (≤6 green, 7–8 amber, 9–10 red), faint rest.',
        },
      },
    },
  });

  const squat: PrescribedSetDto[] = [
    { setNumber: 1, type: 'working', reps: 5, amrap: false, targetRpe: 8, targetWeightKg: 142.5, restSeconds: 180 },
    { setNumber: 2, type: 'working', reps: 5, amrap: false, targetRpe: 8, targetWeightKg: 142.5, restSeconds: 180 },
    { setNumber: 3, type: 'working', reps: 5, amrap: false, targetRpe: 9, targetWeightKg: 142.5, restSeconds: 180 },
  ];

  const ramp: PrescribedSetDto[] = [6, 7, 7, 8, 8].map((rpe, i) => ({
    setNumber: i + 1,
    type: 'working' as const,
    reps: 5,
    amrap: false,
    targetRpe: rpe,
    restSeconds: 180,
  }));

  const repRange: PrescribedSetDto[] = [1, 2, 3].map((n) => ({
    setNumber: n,
    type: 'working' as const,
    reps: 8,
    repsMin: 6,
    amrap: false,
    targetRpe: 7,
    restSeconds: 120,
  }));

  const mixed: PrescribedSetDto[] = [
    { setNumber: 1, type: 'working', reps: 5, amrap: false, targetRpe: 6, restSeconds: 180 },
    { setNumber: 2, type: 'working', reps: 3, amrap: false, targetRpe: 8, restSeconds: 120 },
  ];

  const plank: PrescribedSetDto[] = [
    { setNumber: 1, type: 'working', reps: 0, amrap: false, durationSeconds: 45, restSeconds: 60 },
    { setNumber: 2, type: 'working', reps: 0, amrap: false, durationSeconds: 45, restSeconds: 60 },
  ];

  const amrap: PrescribedSetDto[] = [
    { setNumber: 1, type: 'working', reps: 8, amrap: true, targetRpe: 10, restSeconds: 0 },
  ];
</script>

{#snippet template(args: { sets: PrescribedSetDto[] })}
  <SetChips {...args} />
{/snippet}

<Story name="Uniform sets collapse" {template} args={{ sets: squat }} />
<Story name="RPE ramp becomes range" {template} args={{ sets: ramp }} />
<Story name="Rep range" {template} args={{ sets: repRange }} />
<Story name="Mixed stays per-set" {template} args={{ sets: mixed }} />
<Story name="Timed holds" {template} args={{ sets: plank }} />
<Story name="AMRAP finisher" {template} args={{ sets: amrap }} />
