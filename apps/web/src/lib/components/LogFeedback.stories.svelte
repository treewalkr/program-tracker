<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import LogFeedback from './LogFeedback.svelte';
  import type { LogReviewInput } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/LogFeedback',
    component: LogFeedback,
    parameters: {
      docs: {
        description: {
          component:
            'The coach\'s review of one session log, cardio or strength: a feedback note the member sees on the session in the portal, and "Mark reviewed". Used under plan against actual in CardioReview and under a strength session in the History tab.',
        },
      },
    },
  });

  const review = async (input: LogReviewInput) => ({ id: 'sl-1', reviewedAt: input.reviewed ? new Date().toISOString() : null, reviewedBy: 'me', trainerFeedback: input.feedback ?? null });
</script>

<Story name="To review" asChild>
  <div style="max-width: 640px"><LogFeedback log={{ reviewedAt: null, trainerFeedback: null }} member="Nok" onreview={review} /></div>
</Story>

<Story name="Reviewed with feedback" asChild>
  <div style="max-width: 640px">
    <LogFeedback log={{ reviewedAt: '2026-11-22T08:00:00Z', trainerFeedback: 'Bar speed looked great. Add 2.5 kg on the top set next week.' }} member="Nok" onreview={review} />
  </div>
</Story>

<Story name="Save fails" asChild>
  <div style="max-width: 640px">
    <LogFeedback log={{ reviewedAt: null, trainerFeedback: null }} member="Nok" onreview={async () => { throw new Error('Could not save'); }} />
  </div>
</Story>
