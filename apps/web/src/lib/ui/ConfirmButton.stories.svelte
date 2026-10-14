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
            'Two-step destructive action: first click arms, second click within `ms` (default 4s) confirms; the armed state auto-resets. Replaces the divergent armDelete/armedDelete patterns.',
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
