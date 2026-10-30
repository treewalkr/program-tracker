<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SessionCard from './SessionCard.svelte';
  import type { CardioPrescriptionDto, ExerciseRole, PrescribedSetDto, SessionKindDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/SessionCard',
    component: SessionCard,
    parameters: {
      docs: {
        description: {
          component:
            'Prescribed session row: name, optional day pill, exercise rows with an optional role chip and set chips, optional cardio footer. Hairline-divided when stacked inside a Panel — pass multiple as children to see the dividers.',
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
    { name: 'Bench Press', role: 'primary' as ExerciseRole, sets: working(5, 4, 80, 8) },
    { name: 'Barbell Row', role: 'strength' as ExerciseRole, sets: working(8, 3, 70, 7) },
    { name: '', role: 'accessory' as ExerciseRole, sets: working(12, 3, 20) },
  ];

  const lower = [
    { name: 'Back Squat', sets: working(5, 3, 140, 8) },
    { name: 'Romanian Deadlift', sets: working(8, 3, 100) },
  ];

  const patternSession = [
    { name: 'Bench Press', role: 'primary' as ExerciseRole, movementPattern: 'horizontal_push', sets: working(5, 4, 80, 8) },
    { name: 'Barbell Row', role: 'strength' as ExerciseRole, movementPattern: 'horizontal_pull', sets: working(8, 3, 70, 7) },
    { name: 'Untagged Drill', role: 'accessory' as ExerciseRole, sets: working(12, 3, 20) },
  ];
</script>

{#snippet template(args: { name: string; when?: string; kind?: SessionKindDto; cardio?: CardioPrescriptionDto | null; exercises?: { name: string; role?: ExerciseRole; movementPattern?: string | null; sets: PrescribedSetDto[] }[] })}
  <SessionCard {...args} />
{/snippet}

<Story name="Lifting day" {template} args={{ name: 'Day 1 — Upper', when: 'Thursday · due today', kind: 'lifting', exercises: upper }} />
<Story name="Cardio session" {template} args={{ name: 'Cardio 1', kind: 'cardio', cardio: { modality: 'Bike', durationMin: 40, hrZone: 2, distanceKm: 15, targetRpe: 5 } }} />
<Story name="Two-a-day (evening cardio)" {template} args={{ name: 'Evening Cardio', when: 'Thursday · evening', kind: 'cardio', cardio: { modality: 'Run', durationMin: 30, hrZone: 3, targetRpe: 7 } }} />
<Story name="With movement patterns & balance" {template} args={{ name: 'Day 3 — Pattern balance', kind: 'lifting', exercises: patternSession }} />
