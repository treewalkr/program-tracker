<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import OutboxHealth from './OutboxHealth.svelte';
  import { counts, fromSentEmails, queueLag, sampleOutbox, type OutboxFilter } from '$lib/emailOutbox';

  const { Story } = defineMeta({
    title: 'Domain/OutboxHealth',
    component: OutboxHealth,
    parameters: {
      docs: {
        description: {
          component:
            'Outbox health counters that double as list filters (aria-pressed; press again to clear). Retrying and Failed take amber/red ink when non-zero; the oldest-waiting age turns amber past 5 min. Send-log data shows Failed and Sent only.',
        },
      },
    },
  });

  const now = Date.now();
  const sample = sampleOutbox(now).messages;
  const late = sample.map((m) => (m.status === 'queued' ? { ...m, createdAt: new Date(now - 9 * 60_000).toISOString() } : m));
  const log = fromSentEmails([
    { id: 'a1', kind: 'feedback.reply', label: 'FB-004 · Reply', error: null, sentAt: new Date(now - 7_200_000).toISOString(), recipient: { name: 'Mai Tanaka', email: 'm•••@gmail.com' }, feedbackNumber: 4 },
    { id: 'a2', kind: 'feedback.created', label: 'FB-005 · New ticket', error: 'provider_error', sentAt: new Date(now - 9_000_000).toISOString(), recipient: null, feedbackNumber: 5 },
  ]).messages;
</script>

<script lang="ts">
  let filter = $state<OutboxFilter>('all');
</script>

<Story name="Sample outbox" asChild>
  <section class="panel">
    <OutboxHealth counts={counts(sample, now)} lag={queueLag(sample, now)} source="outbox" {filter} onfilter={(f) => (filter = f)} />
  </section>
</Story>

<Story name="Queue running late" asChild>
  <section class="panel">
    <OutboxHealth counts={counts(late, now)} lag={queueLag(late, now)} source="outbox" filter="retrying" onfilter={() => {}} />
  </section>
</Story>

<Story name="Send log (no queue)" asChild>
  <section class="panel">
    <OutboxHealth counts={counts(log, now)} lag={null} source="log" filter="all" onfilter={() => {}} />
  </section>
</Story>
