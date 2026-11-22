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
            'The interval table inside the cardio session editor: type (Select 04), repeat, time (Input 11 cell), distance, zone and RPE per line, a recovery between reps on work lines, a second line per row for the pace target (in the modality’s metric: /km or /mi, /500 m, km/h or mph, none), a bpm band and a note, a zone and pace target on recoveries, then the totals and a timeline. Recoveries sit between reps only (5 reps → 4 recoveries) unless “also after the last rep” is on; a distance-only part never gets an invented time.',
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
  const aiTempo: CardioInterval[] = [
    { id: 'wu', type: 'warmup', repeat: 1, durationSec: 300, hrZone: 2, notes: 'easy jog, finish with 2 strides' },
    { id: 'reps', type: 'work', repeat: 3, durationSec: 300, hrZone: 4, paceSecPerKm: 320, recovery: { type: 'active_recovery', durationSec: 60, hrZone: 1 } },
    { id: 'cd', type: 'cooldown', repeat: 1, durationSec: 180, hrZone: 1 },
  ];
  let tempo = $state(structuredClone(aiTempo));
  let tempoPhone = $state(structuredClone(aiTempo));
  let row = $state<CardioInterval[]>([
    { id: 'w', type: 'warmup', repeat: 1, durationSec: 600 },
    { id: 'r', type: 'work', repeat: 4, distanceM: 500, paceSecPerKm: 220, recovery: { type: 'passive_recovery', durationSec: 120 } },
  ]);
</script>

<Story name="5 × 2 min with bpm" asChild>
  <div style="max-width: 760px"><IntervalBuilder bind:intervals={withZones} {zones} /></div>
</Story>

<Story name="AI tempo: pace, note and a recovery target" asChild>
  <div style="max-width: 760px"><IntervalBuilder bind:intervals={tempo} {zones} metric="pace" /></div>
</Story>

<Story name="AI tempo on a phone (targets on the second line)" asChild>
  <div style="max-width: 390px"><IntervalBuilder bind:intervals={tempoPhone} {zones} metric="pace" /></div>
</Story>

<Story name="Rowing: a /500 m split" asChild>
  <div style="max-width: 760px"><IntervalBuilder bind:intervals={row} metric="split" /></div>
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
