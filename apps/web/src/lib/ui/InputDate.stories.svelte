<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import InputDate from './InputDate.svelte';

  const { Story } = defineMeta({
    title: 'UI/Input/10 Date field',
    component: InputDate,
    parameters: {
      docs: {
        description: {
          component:
            'One calendar date: program start, log date, test day. The native date input keeps its picker, keys (↑/↓ change the focused part, Tab moves between parts) and locale, in the base box with a mono figure. A readout cap says the date in words and how far away it is ("Mon 23 Nov · in 2 days"). With `mondayOnly`, a start that isn\'t a Monday gets an amber line and a one-click fix to the next Monday.',
        },
      },
    },
  });

  // Stories pin today so the readouts don't drift.
  const today = '2026-11-21';
</script>

<script lang="ts">
  let empty = $state('');
  let picked = $state('2026-11-23');
  let saturday = $state('2026-11-28');
  let late = $state('2027-03-01');
</script>

<Story name="Empty" asChild>
  <div style="max-width: 320px"><InputDate label="Test day" bind:value={empty} {today} hint="When to retest the 1RMs." /></div>
</Story>

<Story name="Picked" asChild>
  <div style="max-width: 320px"><InputDate label="Week 1 starts" bind:value={picked} {today} mondayOnly /></div>
</Story>

<Story name="Start not on a Monday" asChild>
  <div style="max-width: 320px"><InputDate label="Week 1 starts" bind:value={saturday} {today} mondayOnly /></div>
</Story>

<Story name="Error" asChild>
  <div style="max-width: 320px"><InputDate label="Week 1 starts" bind:value={late} {today} mondayOnly max="2027-01-16" error="Pick a date at most 8 weeks ahead." /></div>
</Story>

<Story name="Disabled" asChild>
  <div style="max-width: 320px"><InputDate label="Logged on" value="2026-11-19" {today} disabled /></div>
</Story>
