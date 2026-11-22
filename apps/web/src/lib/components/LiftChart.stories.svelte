<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import LiftChart from './LiftChart.svelte';

  const { Story } = defineMeta({
    title: 'Domain/LiftChart',
    component: LiftChart,
    parameters: {
      docs: {
        description: {
          component:
            "One measure over true time: a lift's best e1RM per session day (History tab), a hold in seconds, or an estimated VO₂max per field test (Assessments tab). Crosshair snaps to the nearest point (pointer or ← →). The close button shows only when `onclose` is given.",
        },
      },
    },
  });

  const squat = [
    { date: '2026-09-01', value: 72.5 },
    { date: '2026-09-15', value: 75 },
    { date: '2026-10-06', value: 77.5 },
    { date: '2026-10-30', value: 80 },
  ];
  const vo2 = [
    { date: '2026-09-22', value: 41.2 },
    { date: '2026-10-20', value: 44.2 },
    { date: '2026-11-21', value: 45.9 },
  ];
</script>

<Story name="Lift e1RM" asChild>
  <div style="max-width: 640px"><LiftChart name="Back Squat" series={squat} unit="kg" onclose={() => {}} /></div>
</Story>

<Story name="VO₂max per test" asChild>
  <div style="max-width: 640px"><LiftChart name="Cooper 12-minute run" series={vo2} unit="ml/kg/min" measure="Estimated VO₂max" per="test" /></div>
</Story>
