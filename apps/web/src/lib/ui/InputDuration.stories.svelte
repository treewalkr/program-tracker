<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import InputDuration from './InputDuration.svelte';

  const { Story } = defineMeta({
    title: 'UI/Input/11 Duration field',
    component: InputDuration,
    parameters: {
      docs: {
        description: {
          component:
            'A time typed as mm:ss or h:mm:ss — a cardio log’s duration, an interval’s time, a 1.5-mile finish. A bare number is minutes ("40" → 40:00). The value is whole seconds and shows back in the clock format on blur; ↑/↓ step by `step` seconds (Shift ×10). `cell` gives the Input 04 quiet-cell look for interval tables. A number with a unit stays Input 02.',
        },
      },
    },
  });
</script>

<script lang="ts">
  let logged = $state<number | null>(2110);
  let blank = $state<number | null>(null);
  let long = $state<number | null>(5400);
  let rep = $state<number | null>(120);
  let over = $state<number | null>(30);
</script>

<Story name="Cardio log" asChild>
  <div style="max-width: 320px"><InputDuration label="Duration" bind:value={logged} min={60} max={18000} hint="35:10, 1:05:00 or 40 for minutes." /></div>
</Story>

<Story name="Blank (required)" asChild>
  <div style="max-width: 320px"><InputDuration label="Duration" bind:value={blank} width="auto" /></div>
</Story>

<Story name="Hours" asChild>
  <div style="max-width: 320px"><InputDuration label="Long run" bind:value={long} hours width="auto" /></div>
</Story>

<Story name="Interval cell" asChild>
  <table style="font: 13px var(--font-ui); border-collapse: collapse">
    <thead><tr><th style="text-align:left; padding: 4px 12px">Type</th><th style="text-align:right; padding: 4px 12px">Time</th></tr></thead>
    <tbody><tr><td style="padding: 4px 12px">Work</td><td style="padding: 4px 12px; width: 9ch"><InputDuration label="Time for interval 2" bind:value={rep} step={15} cell /></td></tr></tbody>
  </table>
</Story>

<Story name="Out of range" asChild>
  <div style="max-width: 320px"><InputDuration label="1.5-mile time" bind:value={over} min={60} max={14400} error="Between 1:00 and 4:00:00" /></div>
</Story>

<Story name="Disabled" asChild>
  <div style="max-width: 320px"><InputDuration label="Duration" value={1980} disabled /></div>
</Story>
