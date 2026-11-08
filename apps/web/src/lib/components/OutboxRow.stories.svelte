<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import OutboxRow from './OutboxRow.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { sampleOutbox } from '$lib/emailOutbox';

  const { Story } = defineMeta({
    title: 'Domain/OutboxRow',
    component: OutboxRow,
    parameters: {
      docs: {
        description: {
          component:
            'One outbox message: status, masked recipient ("Removed account" when gone), the ticket it was about, and a meta line (attempts, timing). The status + recipient block is the disclosure button; the detail holds the attempt timeline, copyable dedupe key and message id, and the source event. Stacks into a card below 640px of container width.',
        },
      },
    },
  });

  const now = Date.now();
  const all = sampleOutbox(now).messages;
  const first = (s: string) => all.find((m) => m.status === s)!;
  const sent = all.find((m) => m.status === 'sent' && m.recipient)!;
  const gone = all.find((m) => m.recipient === null)!;
</script>

<Story name="Every status" asChild>
  <section class="panel">
    {#each [first('queued'), first('sending'), first('retrying'), first('dead'), sent, gone] as m (m.id)}
      <OutboxRow message={m} {now} />
    {/each}
  </section>
</Story>

<Story name="Retrying, expanded with actions" asChild>
  <section class="panel">
    <OutboxRow message={first('retrying')} {now} open>
      {#snippet actions()}
        <Button small>Retry now</Button>
        <Button small variant="danger">Discard</Button>
      {/snippet}
    </OutboxRow>
  </section>
</Story>

<Story name="Failed, expanded" asChild>
  <section class="panel"><OutboxRow message={first('dead')} {now} open /></section>
</Story>

<Story name="Narrow card" asChild>
  <section class="panel" style="max-width: 420px">
    <OutboxRow message={first('retrying')} {now} />
    <OutboxRow message={sent} {now} open />
  </section>
</Story>
