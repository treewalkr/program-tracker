<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SelectStepper from './SelectStepper.svelte';

  const { Story } = defineMeta({
    title: 'UI/Select/05 Figure stepper',
    component: SelectStepper,
    parameters: {
      docs: {
        description: {
          component:
            'Mono tabular value with a unit, stacked step buttons, and a number grid on open. For numbers picked repeatedly: reps, kg, RPE, rest. Closed, ↑/↓ step the value; open, arrows move through the grid.',
        },
      },
    },
  });

  const rpeValues = [5, 6, 7, 7.5, 8, 8.5, 9, 9.5, 10];
  const rpeScale = (v: number) => (v < 7 ? 'low' : v < 9 ? 'mid' : 'high');
  const rir = (v: number) => (v >= 10 ? 'no reps in reserve' : v >= 9 ? 'about 1 rep in reserve' : v >= 8 ? 'about 1–2 reps in reserve' : 'plenty left in the tank');
  const rests = [30, 45, 60, 90, 120, 150, 180, 240, 300];
</script>

<script lang="ts">
  let rpe = $state(8.5);
  let rest = $state(120);
  let open = $state(true);
</script>

<Story name="RPE (open)" asChild>
  <div style="min-height: 190px"><SelectStepper label="RPE" unit="RPE" values={rpeValues} scale={rpeScale} describe={rir} bind:value={rpe} bind:open /></div>
</Story>

<Story name="Rest seconds" asChild>
  <div style="min-height: 190px"><SelectStepper label="Rest" unit="s rest" values={rests} columns={3} bind:value={rest} /></div>
</Story>
