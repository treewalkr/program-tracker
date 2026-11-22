<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { computeHrZones, type CardioPrescription } from '@pt/shared';
  import CardioBreakdown from './CardioBreakdown.svelte';

  const { Story } = defineMeta({
    title: 'Domain/CardioBreakdown',
    component: CardioBreakdown,
    parameters: {
      docs: {
        description: {
          component:
            'An interval session folded away under its one-line summary (the AI draft review): warm-up, work × reps, the recovery between reps and cool-down, each with its zone, bpm (own band, else the zone in the member’s profile) and pace in the modality’s metric. A steady session renders nothing.',
        },
      },
    },
  });

  const zones = computeHrZones('karvonen', { restingHr: 58, maxHr: 188 });
  const tempo: CardioPrescription = {
    modality: 'Running',
    targetRpe: 6,
    intervals: [
      { id: 'wu', type: 'warmup', repeat: 1, durationSec: 300, hrZone: 2, notes: 'easy jog, finish with 2 strides' },
      { id: 'reps', type: 'work', repeat: 3, durationSec: 300, hrZone: 4, paceSecPerKm: 320, recovery: { type: 'active_recovery', durationSec: 60, hrZone: 1 } },
      { id: 'cd', type: 'cooldown', repeat: 1, durationSec: 180, hrZone: 1 },
    ],
  };
  const row: CardioPrescription = {
    modality: 'Rowing',
    intervals: [{ id: 'r', type: 'work', repeat: 4, distanceM: 500, paceSecPerKm: 220, recovery: { type: 'passive_recovery', durationSec: 120 } }],
  };
</script>

<Story name="AI tempo, open" asChild>
  <div style="max-width: 420px"><CardioBreakdown cardio={tempo} {zones} open /></div>
</Story>

<Story name="Folded" asChild>
  <div style="max-width: 420px"><CardioBreakdown cardio={tempo} {zones} /></div>
</Story>

<Story name="Rowing split, no HR profile" asChild>
  <div style="max-width: 420px"><CardioBreakdown cardio={row} open /></div>
</Story>
