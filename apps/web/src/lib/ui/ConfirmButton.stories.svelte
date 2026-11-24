<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ConfirmButton from './ConfirmButton.svelte';

  const { Story } = defineMeta({
    title: 'UI/ConfirmButton',
    component: ConfirmButton,
    parameters: {
      docs: {
        description: {
          component:
            'Two-step destructive action: first click arms, second click within `ms` (default 4s) confirms; the armed state auto-resets. Idle, the button is only as wide as its label. Armed, it grows to the confirm label but never shrinks, so the pointer stays on it for the second click; in a narrow row the confirm label wraps instead of overflowing. A confirming click within `guardMs` (500 ms) of arming is ignored, so a double tap only arms. Armed shows an outline on every variant, buzzes briefly where supported and announces the confirm label politely. Replaces the divergent armDelete/armedDelete patterns.',
        },
      },
    },
  });
</script>

<script lang="ts">
  let deleted = $state(0);

  /** Clicks the story's button twice, `gap` ms apart, like a finger would. */
  let guardRow = $state<HTMLDivElement>();
  let guardConfirmed = $state(0);
  function tapTwice(gap: number) {
    const btn = guardRow?.querySelector<HTMLButtonElement>('button.btn');
    if (!btn) return;
    btn.click();
    setTimeout(() => btn.click(), gap);
  }
</script>

<Story name="Delete template" asChild>
  <div style="display: flex; align-items: center; gap: 14px;">
    <ConfirmButton label="Delete template" onconfirm={() => (deleted += 1)} />
    <span class="subtle">confirmed {deleted}×</span>
  </div>
</Story>

<Story name="Remove day (small)" asChild>
  <ConfirmButton label="Remove day" small onconfirm={() => (deleted += 1)} />
</Story>

<Story name="Arming grows, never shrinks" asChild>
  <div style="display: flex; align-items: center; gap: 6px;">
    <ConfirmButton label="Remove" confirmLabel="Remove invite?" small subject="Dana Lee" onconfirm={() => (deleted += 1)} />
    <span class="subtle">idle, only as wide as "Remove"</span>
  </div>
</Story>

<Story name="Long confirm label in a phone-width row" asChild>
  <div style="display: flex; align-items: center; gap: 8px; width: 240px; border: 1px dashed var(--line); padding: 8px;">
    <span style="flex: 1; min-width: 0;">6-week wave</span>
    <ConfirmButton label="Delete" confirmLabel="Delete 6-week wave (coach's own)?" class="ghost" small onconfirm={() => (deleted += 1)} />
  </div>
</Story>

<Story name="Neutral until armed (small)" asChild>
  <ConfirmButton label="Turn access off" confirmLabel="Block sign-in?" variant="default" armedVariant="danger" small subject="Dana Lee" onconfirm={() => (deleted += 1)} />
</Story>

<Story name="Double tap only arms" asChild>
  <div style="display: grid; gap: 10px; justify-items: start;">
    <div bind:this={guardRow} style="display: flex; align-items: center; gap: 14px;">
      <ConfirmButton label="Delete template" onconfirm={() => (guardConfirmed += 1)} />
      <span class="subtle" data-testid="guard-count">confirmed {guardConfirmed}×</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button type="button" class="btn small" onclick={() => tapTwice(120)}>Double tap (120 ms)</button>
      <button type="button" class="btn small" onclick={() => tapTwice(600)}>Tap, then tap again (600 ms)</button>
    </div>
    <span class="subtle">The 120 ms pair leaves it armed; the 600 ms pair confirms.</span>
  </div>
</Story>
