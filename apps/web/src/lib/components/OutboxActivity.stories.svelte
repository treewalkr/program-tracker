<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import OutboxActivity from './OutboxActivity.svelte';
  import { hourlyBuckets, sampleOutbox } from '$lib/emailOutbox';

  const { Story } = defineMeta({
    title: 'Domain/OutboxActivity',
    component: OutboxActivity,
    parameters: {
      docs: {
        description: {
          component:
            'Sends per hour over the last 24 h on the contributions ramp (done-1…4, scaled to the busiest hour). Hours with a failed attempt get a red tick; each cell has a tooltip ("14:00 · 6 sent · 1 failed").',
        },
      },
    },
  });

  const now = Date.now();
  const buckets = hourlyBuckets(sampleOutbox(now).messages, now);
  const quiet = hourlyBuckets([], now);
</script>

<Story name="Sample outbox" asChild>
  <section class="panel"><OutboxActivity {buckets} /></section>
</Story>

<Story name="Nothing sent" asChild>
  <section class="panel"><OutboxActivity buckets={quiet} /></section>
</Story>
