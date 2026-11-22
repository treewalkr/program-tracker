<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { computeHrZones, type CardioInterval } from '@pt/shared';
  import IntervalBuilder from './IntervalBuilder.svelte';

  const { Story } = defineMeta({
    title: 'Domain/IntervalBuilder',
    component: IntervalBuilder,
    parameters: {
      docs: {
        description: {
          component:
            'The interval table inside the cardio session editor: type (Select 04), repeat, time (Input 11 cell), distance, zone and RPE per line, a recovery between reps on work lines, then the totals and a timeline. Recoveries sit between reps only (5 reps → 4 recoveries) unless “also after the last rep” is on; a distance-only part never gets an invented time.',
        },
      },
    },
  });

  const zones = computeHrZones('karvonen', { restingHr: 58, maxHr: 188 });
  const mockup: CardioInterval[] = [
    { id: 'w', type: 'warmup', repeat: 1, durationSec: 600, hrZone: 2 },
    { id: 'r', type: 'work', repeat: 5, durationSec: 120, hrZone: 4, rpe: 8, recovery: { type: 'active_recovery', durationSec: 120 } },
    { id: 'c', type: 'cooldown', repeat: 1, durationSec: 300, hrZone: 1 },
  ];
</script>

<script lang="ts">
  let withZones = $state(structuredClone(mockup));
  let noProfile = $state(structuredClone(mockup));
  let distance = $state<CardioInterval[]>([
    { id: 'w', type: 'warmup', repeat: 1, durationSec: 600 },
    { id: 'r', type: 'work', repeat: 6, distanceM: 400, rpe: 8, recovery: { type: 'passive_recovery', durationSec: 90 } },
  ]);
  let empty = $state<CardioInterval[]>([]);
</script>

<Story name="5 × 2 min with bpm" asChild>
  <div style="max-width: 760px"><IntervalBuilder bind:intervals={withZones} {zones} /></div>
</Story>

<Story name="No HR profile (zones only)" asChild>
  <div style="max-width: 760px"><IntervalBuilder bind:intervals={noProfile} /></div>
</Story>

<Story name="Distance reps (time unknown)" asChild>
  <div style="max-width: 760px"><IntervalBuilder bind:intervals={distance} /></div>
</Story>

<Story name="Empty" asChild>
  <div style="max-width: 760px"><IntervalBuilder bind:intervals={empty} /></div>
</Story>
