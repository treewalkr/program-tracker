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
            'Two-step destructive action: first click arms, second click within `ms` (default 4s) confirms; the armed state auto-resets. Both labels share one grid cell, so the button is as wide as the longer one and arming never shifts the row. Replaces the divergent armDelete/armedDelete patterns.',
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

<Story name="Arming keeps its width" asChild>
  <div style="display: flex; align-items: center; gap: 6px;">
    <ConfirmButton label="Remove" confirmLabel="Remove invite?" small subject="Dana Lee" onconfirm={() => (deleted += 1)} />
    <span class="subtle">the neighbour doesn't move</span>
  </div>
</Story>

<Story name="Neutral until armed (small)" asChild>
  <ConfirmButton label="Turn access off" confirmLabel="Block sign-in?" variant="default" armedVariant="danger" small subject="Dana Lee" onconfirm={() => (deleted += 1)} />
</Story>
