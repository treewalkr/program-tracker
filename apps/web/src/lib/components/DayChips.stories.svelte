<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import DayChips from './DayChips.svelte';

  const { Story } = defineMeta({
    title: 'Domain/DayChips',
    component: DayChips,
    parameters: {
      docs: {
        description: {
          component:
            'One row of Mon–Sun toggle chips (aria-pressed) bound to sorted ISO weekdays. Picked days fill Inverted Ink; with none picked a muted line says what an empty list means. Fits a 390px phone without scrolling.',
        },
      },
    },
  });
</script>

<script>
  let picked = $state([1, 3, 5]);
  let none = $state([]);
</script>

<Story name="Picked days" asChild>
  <DayChips bind:days={picked} label="Lifting days" idPrefix="s1" empty="No fixed days — sessions are spread across the week" />
</Story>

<Story name="Nothing picked" asChild>
  <DayChips bind:days={none} label="Cardio days" idPrefix="s2" empty="No fixed days — on lifting days" />
</Story>
