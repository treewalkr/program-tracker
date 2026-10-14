<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SignalRow from './SignalRow.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  const { Story } = defineMeta({
    title: 'Domain/SignalRow',
    component: SignalRow,
    parameters: {
      docs: {
        description: {
          component:
            'The needs-review unit — lamp dot (red/amber/green) beside a title and evidence line, actions right. The lamp always travels with a label and evidence; color never signals alone. Actions wrap to their own row at 520px.',
        },
      },
    },
  });
</script>

<Story name="Urgent — block ending" asChild>
  <section class="panel" aria-live="polite">
    <SignalRow
      severity="urgent"
      title="Block ending — 8 wks done"
      evidence="Tonnage flat for 2 wks (12.4t → 12.1t); avg RPE 8.4 over the last 3 sessions."
    >
      {#snippet actions()}
        <Button href="/clients/1/generate" variant="primary" small>
          {#snippet icon()}<Icon name="sparkle" />{/snippet}
          Draft next block
        </Button>
        <Button href="/clients/1" variant="ghost" small>Open client</Button>
      {/snippet}
    </SignalRow>
  </section>
</Story>

<Story name="Attention — RPE creep" asChild>
  <section class="panel">
    <SignalRow
      severity="attention"
      title="RPE creep on squat"
      evidence="e1RM steady at 142.5 but reported RPE rose 7.5 → 8.8 across the block."
    >
      {#snippet actions()}
        <button class="snooze">Snooze 1 wk</button>
      {/snippet}
    </SignalRow>
  </section>
</Story>

<Story name="Info with snooze error" asChild>
  <section class="panel">
    <SignalRow
      severity="info"
      title="Session logged"
      evidence="Tue lower body — 4 of 4 exercises logged, avg RPE 7.9."
      error="Couldn't snooze — network error"
    />
  </section>
</Story>

<Story name="Overview variant (client link in title)" asChild>
  <section class="panel">
    <SignalRow severity="urgent" evidence="Tonnage flat for 2 wks; avg RPE 8.4 over the last 3 sessions.">
      {#snippet title()}
        Block ending — <a class="client-link" href="/clients/1">Alex Rivera</a>
      {/snippet}
      {#snippet actions()}
        <Button href="/clients/1" variant="ghost" small>Open client</Button>
      {/snippet}
    </SignalRow>
  </section>
</Story>
