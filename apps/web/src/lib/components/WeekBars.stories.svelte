<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import WeekBars from './WeekBars.svelte';

  const { Story } = defineMeta({
    title: 'Domain/WeekBars',
    component: WeekBars,
    parameters: {
      docs: {
        description: {
          component:
            "One value per week as heat-stepped bars, each labelled, with an optional dashed target line and the current week in blue. The member Cardio tab's session load by week; same scale and colours as PulseChart.",
        },
      },
    },
  });

  const load = [
    { label: '12 Oct', value: 420 },
    { label: '19 Oct', value: 480 },
    { label: '26 Oct', value: 510 },
    { label: '2 Nov', value: 560 },
    { label: '9 Nov', value: 590 },
    { label: '16 Nov', value: 546 },
  ];
</script>

<Story name="Session load with target" asChild>
  <div style="max-width: 640px"><WeekBars weeks={load} unit="AU" target={600} /></div>
</Story>

<Story name="A week with nothing logged" asChild>
  <div style="max-width: 640px"><WeekBars weeks={[...load.slice(0, 3), { label: '2 Nov', value: 0 }, ...load.slice(4)]} unit="AU" target={600} /></div>
</Story>

<Story name="No target" asChild>
  <div style="max-width: 640px"><WeekBars weeks={load.map((w) => ({ ...w, value: Math.round(w.value / 6) }))} unit="min" /></div>
</Story>
