<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import TrainingWeekGrid from './TrainingWeekGrid.svelte';
  import { emptyProfile } from '$lib/clientProfile';

  const { Story } = defineMeta({
    title: 'Domain/TrainingWeekGrid',
    component: TrainingWeekGrid,
    parameters: {
      docs: {
        description: {
          component:
            'A client\'s training week in one grid: lifting sessions a week (stepper), Lift and Run toggle rows, and a Long run radio row (with "Any") across Mon–Sun. Bound to the profile form; a one-line summary reads the week back.',
        },
      },
    },
  });
</script>

<script>
  let planned = $state({ ...emptyProfile('2026-11-09'), sessionsPerWeek: 3, trainingDays: [1, 3, 5], cardioDays: [2, 6], longRunDay: 7 });
  let blank = $state(emptyProfile('2026-11-09'));
  let stacked = $state({ ...emptyProfile('2026-11-09'), sessionsPerWeek: 5, trainingDays: [1, 3, 5] });
</script>

<Story name="Planned week" asChild>
  <TrainingWeekGrid bind:form={planned} idPrefix="s1" />
</Story>

<Story name="Nothing picked" asChild>
  <TrainingWeekGrid bind:form={blank} idPrefix="s2" />
</Story>

<Story name="Stacked sessions" asChild>
  <TrainingWeekGrid bind:form={stacked} idPrefix="s3" />
</Story>
