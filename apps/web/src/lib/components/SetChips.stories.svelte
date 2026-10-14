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
            'Code-span set chips: mono `3×8`, `@RPE` colored by effort tier (≤6 green, 7–8 amber, 9–10 red), faint rest, dashed border for warm-ups.',
        },
      },
    },
  });

  const squat: PrescribedSetDto[] = [
    { setNumber: 1, type: 'warm_up', reps: 5, amrap: false, targetWeightKg: 60, restSeconds: 90 },
    { setNumber: 2, type: 'warm_up', reps: 3, amrap: false, targetWeightKg: 100, restSeconds: 120 },
    { setNumber: 3, type: 'working', reps: 5, amrap: false, targetRpe: 8, targetWeightKg: 142.5, restSeconds: 180 },
    { setNumber: 4, type: 'working', reps: 5, amrap: false, targetRpe: 8, targetWeightKg: 142.5, restSeconds: 180 },
    { setNumber: 5, type: 'working', reps: 5, amrap: false, targetRpe: 9, targetWeightKg: 142.5, restSeconds: 180 },
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

<Story name="Back squat" {template} args={{ sets: squat }} />
<Story name="Timed holds" {template} args={{ sets: plank }} />
<Story name="AMRAP finisher" {template} args={{ sets: amrap }} />
