<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import PulseChart from './PulseChart.svelte';
  import type { WeekMetrics } from '@pt/shared';

  const { Story } = defineMeta({
    title: 'Domain/PulseChart',
    component: PulseChart,
    parameters: {
      docs: {
        description: {
          component:
            'Weekly volume bars for a program block, colored by the contributions ramp. Dashed stubs are planned-only weeks; the blue tick marks the current week.',
        },
      },
    },
  });

  const mk = (
    week: number,
    directive: WeekMetrics['directive'],
    tonnage: number,
    extra: Partial<WeekMetrics> = {}
  ): WeekMetrics => ({
    week,
    directive,
    tonnage,
    sets: Math.round(tonnage / 250),
    reps: Math.round(tonnage / 30),
    avgRpe: null,
    bestE1rm: 0,
    tonnageDelta: null,
    e1rmDelta: null,
    plannedOnly: false,
    ...extra,
  });
</script>

{#snippet template(args: { weeks: WeekMetrics[]; pulseWeek: number })}
  <div style="max-width: 640px;">
    <PulseChart weeks={args.weeks} pulseWeek={args.pulseWeek} />
  </div>
{/snippet}

<Story
  name="Rising 4-week block"
  {template}
  args={{
    pulseWeek: 3,
    weeks: [
      mk(1, 'base', 11200, { avgRpe: 7.1 }),
      mk(2, '+volume', 13450, { avgRpe: 7.6 }),
      mk(3, '+volume', 15120, { avgRpe: 7.4 }),
      mk(4, 'deload', 0, { plannedOnly: true }),
    ],
  }}
/>

<Story
  name="6-week with planned tail"
  {template}
  args={{
    pulseWeek: 4,
    weeks: [
      mk(1, 'base', 9800, { avgRpe: 6.9 }),
      mk(2, '+volume', 11300, { avgRpe: 7.2 }),
      mk(3, '+intensity', 10800, { avgRpe: 8.0 }),
      mk(4, 'base', 12600, { avgRpe: 7.8 }),
      mk(5, '+volume', 0, { plannedOnly: true }),
      mk(6, 'transition', 0, { plannedOnly: true }),
    ],
  }}
/>

<Story
  name="Single logged week"
  {template}
  args={{
    pulseWeek: 1,
    weeks: [
      mk(1, 'base', 8400, { avgRpe: 7.5 }),
      mk(2, '+volume', 0, { plannedOnly: true }),
      mk(3, '+intensity', 0, { plannedOnly: true }),
    ],
  }}
/>

<Story
  name="All planned"
  {template}
  args={{
    pulseWeek: 1,
    weeks: [mk(1, 'base', 0, { plannedOnly: true }), mk(2, 'deload', 0, { plannedOnly: true })],
  }}
/>
