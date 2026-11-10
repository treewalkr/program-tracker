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

  const superset = [
    { name: 'Back Squat', role: 'primary' as ExerciseRole, sets: working(5, 3, 140, 8) },
    { name: 'Single Leg Throwball', group: 'A', sets: working(8, 3, 4) },
    { name: 'Slamball Side to Side', group: 'A', sets: working(10, 3, 6) },
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

  /** Top set + back-offs, %1RM, an AMRAP and an RPE 9 ramp: every load/effort form on one card. */
  const set = (o: Partial<PrescribedSetDto>, n: number): PrescribedSetDto =>
    ({ setNumber: n, type: 'working', reps: 5, amrap: false, restSeconds: 180, ...o }) as PrescribedSetDto;
  const loaded = [
    {
      name: 'Back Squat', role: 'primary' as ExerciseRole, movementPattern: 'knee_dominant', oneRepMaxKg: 160,
      sets: [set({ reps: 3, percent1rm: 85, targetRpe: 8, tempo: '3-1-1-0' }, 1), ...[2, 3, 4].map((n) => set({ reps: 5, percent1rm: 75, targetRpe: 7, type: 'backoff', tempo: '3-1-1-0' }, n))],
    },
    { name: 'Romanian Deadlift', role: 'secondary' as ExerciseRole, movementPattern: 'hip_dominant', sets: [1, 2, 3].map((n) => set({ reps: 8, targetWeightKg: 100, targetRpe: 7, targetRpeMin: 6, restSeconds: 120 }, n)) },
    { name: 'Push-up', role: 'accessory' as ExerciseRole, movementPattern: 'horizontal_push', sets: [set({ reps: 10, amrap: true, stopRpe: 9, restSeconds: 90 }, 1)] },
    { name: 'Leg Curl', role: 'accessory' as ExerciseRole, movementPattern: 'isolation', sets: [1, 2].map((n) => set({ reps: 12, targetRpe: 7 + n, restSeconds: 60 }, n)) },
  ];
</script>

{#snippet template(args: { name: string; when?: string; kind?: SessionKindDto; cardio?: CardioPrescriptionDto | null; exercises?: { name: string; role?: ExerciseRole; movementPattern?: string | null; sets: PrescribedSetDto[] }[] })}
  <SessionCard {...args} />
{/snippet}

<Story name="Lifting day" {template} args={{ name: 'Upper', tag: 'Session 1', when: 'Thursday · due today', kind: 'lifting', exercises: upper }} />
<Story name="With a superset" {template} args={{ name: 'Lower', tag: 'Session 2', kind: 'lifting', exercises: superset }} />
<Story name="Cardio session" {template} args={{ name: 'Cardio 1', kind: 'cardio', cardio: { modality: 'Bike', durationMin: 40, hrZone: 2, distanceKm: 15, targetRpe: 5 } }} />
<Story name="Two-a-day (evening cardio)" {template} args={{ name: 'Evening Cardio', when: 'Thursday · evening', kind: 'cardio', cardio: { modality: 'Run', durationMin: 30, hrZone: 3, targetRpe: 7 } }} />
<Story name="With movement patterns & balance" {template} args={{ name: 'Pattern balance', tag: 'Session 3', kind: 'lifting', exercises: patternSession }} />
<Story name="Loaded strength day" {template} args={{ name: 'Lower — squat focus', tag: 'Session 1', kind: 'lifting', exercises: loaded }} />
