<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import InputDiff from './InputDiff.svelte';
  import InputUnit from './InputUnit.svelte';

  const { Story } = defineMeta({
    title: 'UI/Input/08 Diff field',
    component: InputDiff,
    parameters: {
      docs: {
        description: {
          component:
            'Change a figure against a baseline: plan vs actual, was → now. A unit field with a leading baseline cap ("plan 100"). When the value differs, the baseline figure is struck and a blue delta chip ("+2.5", "−5") and a reset button ("Reset to plan") appear — DraftReview\'s diff grammar: changed, not good or bad. Screen readers hear "Plan 100 kg, now 102.5 kg, up 2.5". ↑/↓ step like the unit field. A tap selects the figure, so typing replaces it; Enter moves to the next field and never submits the form.',
        },
      },
    },
  });
</script>

<script lang="ts">
  let same = $state<number | null>(100);
  let up = $state<number | null>(102.5);
  let down = $state<number | null>(95);
  let bodyweight = $state<number | null>(72.4);
  let top = $state<number | null>(105);
  let reps = $state<number | null>(5);
  let logTop = $state<number | null>(100);
  let logReps = $state<number | null>(5);
  let submits = $state(0);
</script>

<Story name="Unchanged" asChild>
  <div style="max-width: 320px"><InputDiff label="Top set" bind:value={same} baseline={100} unit="kg" step={2.5} /></div>
</Story>

<Story name="Raised" asChild>
  <div style="max-width: 320px"><InputDiff label="Top set" bind:value={up} baseline={100} unit="kg" step={2.5} /></div>
</Story>

<Story name="Lowered" asChild>
  <div style="max-width: 320px"><InputDiff label="Top set" bind:value={down} baseline={100} unit="kg" step={2.5} hint="Logged lighter than planned." /></div>
</Story>

<Story name="In a log row" asChild>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; align-items: start; max-width: 720px">
    <InputUnit label="Bodyweight" unit="kg" bind:value={bodyweight} step={0.1} />
    <InputDiff label="Top set" bind:value={top} baseline={100} unit="kg" step={2.5} />
    <InputDiff label="Reps" bind:value={reps} baseline={5} unit="reps" baselineLabel="plan" />
  </div>
</Story>

<Story name="Prefilled in a form" asChild>
  <!-- Tap "Top set" and type 105: the plan is selected, so it becomes 105, not 100105. Enter moves to Reps, never submits. -->
  <form style="max-width: 320px; display: grid; gap: 12px" onsubmit={(e) => { e.preventDefault(); submits += 1; }}>
    <InputDiff label="Top set" bind:value={logTop} baseline={100} unit="kg" step={2.5} />
    <InputDiff label="Reps" bind:value={logReps} baseline={5} unit="reps" />
    <p style="font: 12px var(--font-ui); color: var(--muted); margin: 0">Form submitted {submits} times</p>
  </form>
</Story>
