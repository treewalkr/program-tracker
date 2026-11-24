<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { computeHrZones, type ProgramSession } from '@pt/shared';
  import CardioReview from './CardioReview.svelte';
  import type { LogReviewInput, SessionLogDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/CardioReview',
    component: CardioReview,
    parameters: {
      docs: {
        description: {
          component:
            'A logged cardio session, plan beside actual. The plan is the copy saved with the log (program and HR-zone versions named), work reps without per-interval results read "Insufficient data" (with them, a per-rep table: time, distance, pace, avg HR against the work target, RPE), and the feedback is what the member sees in the portal.',
        },
      },
    },
  });

  const session: ProgramSession = {
    id: 'ps-int',
    name: 'Intervals 5 × 2 min',
    seq: 3,
    weekday: 6,
    order: 0,
    kind: 'cardio',
    exercises: [],
    cardio: {
      modality: 'Running',
      targetRpe: 8,
      intervals: [
        { id: 'wu', type: 'warmup', repeat: 1, durationSec: 600, hrZone: 2 },
        { id: 'w', type: 'work', repeat: 5, durationSec: 120, hrZone: 4, recovery: { type: 'active_recovery', durationSec: 120 } },
        { id: 'cd', type: 'cooldown', repeat: 1, durationSec: 300 },
      ],
    },
  };
  const base: SessionLogDto = {
    id: 'sl-1',
    loggedBy: 'client',
    clientId: 'cl-nok',
    programId: 'pg-nok-a',
    programSessionId: 'ps-int',
    date: '2026-11-21',
    kind: 'cardio',
    cardio: { modality: 'Running', durationSec: 2110, durationMin: 35, distanceKm: 5.2, rpe: 7, avgHr: 151, maxHr: 176 },
    notes: 'Legs heavy on the last two reps.',
    perceivedEnergy: null,
    readiness: null,
    flags: null,
    prescription: { programVersion: 4, session, hrProfileVersion: 2, zonesBpm: computeHrZones('karvonen', { restingHr: 58, maxHr: 188 })! },
    reviewedAt: null,
    reviewedBy: null,
    trainerFeedback: null,
    sets: [],
  };
  const review = async (input: LogReviewInput) => ({ id: 'sl-1', reviewedAt: input.reviewed ? new Date().toISOString() : null, reviewedBy: 'me', trainerFeedback: input.feedback ?? null });
</script>

<Story name="To review" asChild>
  <div style="max-width: 640px"><CardioReview log={base} member="Nok" metric="pace" onreview={review} /></div>
</Story>

<Story name="Reviewed with feedback" asChild>
  <div style="max-width: 640px">
    <CardioReview log={{ ...base, reviewedAt: '2026-11-22T08:00:00Z', trainerFeedback: 'Good pacing. Next week, keep reps 3–5 at the same effort as rep 1.' }} member="Nok" metric="pace" onreview={review} />
  </div>
</Story>

<!-- Time-based reps with the member's per-rep distance, avg HR and RPE: the per-rep table and the work-reps HR. -->
<Story name="Per-rep results" asChild>
  <div style="max-width: 375px">
    <CardioReview
      log={{ ...base, cardio: { ...base.cardio!, avgHr: undefined, maxHr: undefined, intervals: [520, 510, 520, 500, 530].map((distanceM, i) => ({ intervalId: 'w', rep: i + 1, distanceM, avgHr: [158, 162, 165, 168, 172][i], rpe: i === 4 ? 9 : undefined })) } }}
      member="Nok"
      metric="pace"
      onreview={review}
    />
  </div>
</Story>

<Story name="Skipped" asChild>
  <div style="max-width: 640px"><CardioReview log={{ ...base, cardio: { modality: 'Cycling', skipped: { reason: 'time' } }, notes: null }} member="Nok" metric="speed" onreview={review} /></div>
</Story>

<Story name="Coach-entered, untested max HR" asChild>
  <div style="max-width: 640px"><CardioReview log={{ ...base, loggedBy: 'trainer' }} member="Nok" metric="pace" zonesApprox onreview={review} /></div>
</Story>
