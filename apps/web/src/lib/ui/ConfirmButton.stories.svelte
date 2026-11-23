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
            'Two-step destructive action: first click arms, second click within `ms` (default 4s) confirms; the armed state auto-resets. Idle, the button is only as wide as its label. Armed, it grows to the confirm label but never shrinks, so the pointer stays on it for the second click; in a narrow row the confirm label wraps instead of overflowing. Replaces the divergent armDelete/armedDelete patterns.',
        },
      },
    },
  });
</script>

<script lang="ts">
  let deleted = $state(0);
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
