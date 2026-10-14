<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SessionCard from './SessionCard.svelte';
  import type { PrescribedSetDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/SessionCard',
    component: SessionCard,
    parameters: {
      docs: {
        description: {
          component:
            'Prescribed session row: name, optional day pill, exercise rows with set chips, optional cardio footer. Hairline-divided when stacked inside a Panel — pass multiple as children to see the dividers.',
        },
      },
    },
  });

  const working = (reps: number, count: number, kg: number, rpe?: number, from = 1): PrescribedSetDto[] =>
    Array.from({ length: count }, (_, i) => ({
      setNumber: from + i,
      type: 'working' as const,
      reps,
      amrap: false,
      targetWeightKg: kg,
      targetRpe: rpe,
      restSeconds: 180,
    }));

  const upper = [
    { name: 'Bench Press', sets: working(5, 4, 80, 8) },
    { name: 'Barbell Row', sets: working(8, 3, 70, 7) },
    { name: '', sets: working(12, 3, 20) },
  ];

  const lower = [
    { name: 'Back Squat', sets: [{ setNumber: 1, type: 'warm_up' as const, reps: 5, amrap: false, targetWeightKg: 60, restSeconds: 90 }, ...working(5, 3, 140, 8, 2)] },
    { name: 'Romanian Deadlift', sets: working(8, 3, 100) },
  ];
</script>

{#snippet template(args: { name: string; when?: string; conditioning?: { label: string; detail?: string | null } | null; exercises: { name: string; sets: PrescribedSetDto[] }[] })}
  <SessionCard {...args} />
{/snippet}

<Story name="Upper day" {template} args={{ name: 'Day 1 — Upper', when: 'Thursday · due today', exercises: upper }} />
<Story name="Lower day with cardio" {template} args={{ name: 'Day 2 — Lower', exercises: lower, conditioning: { label: 'Zone 2', detail: '40 min steady on the bike' } }} />
