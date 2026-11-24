<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import InputUnit from './InputUnit.svelte';

  const { Story } = defineMeta({
    title: 'UI/Input/02 Unit field',
    component: InputUnit,
    parameters: {
      docs: {
        description: {
          component:
            'A typed number with a unit: 1RM kg, bodyweight, weekly cardio minutes, % of 1RM. The figure is right-aligned mono; the unit sits in a well cap like Select 03. ↑/↓ step by `step` (Shift ×10), a comma decimal is read as a dot, and min/max show their error line on blur. A number picked repeatedly from a fixed ladder stays Select 05 Figure stepper.',
        },
      },
    },
  });
</script>

<script lang="ts">
  let orm = $state<number | null>(102.5);
  let cardio = $state<number | null>(90);
  let pct = $state<number | null>(75);
  let both = $state<number | null>(140);
  let over = $state<number | null>(650);
</script>

<Story name="1RM kg" exportName="OneRmKg" asChild>
  <div style="max-width: 320px"><InputUnit label="Back squat 1RM" unit="kg" bind:value={orm} step={2.5} min={0} max={500} hint="↑/↓ step 2.5 kg, Shift for 25." /></div>
</Story>

<Story name="Weekly cardio min" asChild>
  <div style="max-width: 320px"><InputUnit label="Weekly cardio" unit="min" bind:value={cardio} step={5} min={0} max={1500} width="auto" /></div>
</Story>

<Story name="% of 1RM" exportName="PercentOf1Rm" asChild>
  <div style="max-width: 320px"><InputUnit label="Load" unit="% 1RM" bind:value={pct} step={2.5} min={0} max={110} width="auto" /></div>
</Story>

<Story name="Prefix + suffix" asChild>
  <div style="max-width: 320px"><InputUnit label="Top set" prefix="@" unit="kg" bind:value={both} step={2.5} min={0} /></div>
</Story>

<Story name="Out of range" asChild>
  <div style="max-width: 320px"><InputUnit label="Back squat 1RM" unit="kg" bind:value={over} min={0} max={500} error="Between 0 and 500 kg" /></div>
</Story>

<Story name="Disabled" asChild>
  <div style="max-width: 320px"><InputUnit label="Bodyweight" unit="kg" value={72.4} disabled /></div>
</Story>

<Story name="Hidden label (list row)" asChild>
  <div style="max-width: 320px"><InputUnit label="1RM 1 kg" unit="kg" value={140} width="auto" hideLabel /></div>
</Story>
