<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import EmptyState from './EmptyState.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  const { Story } = defineMeta({
    title: 'UI/EmptyState',
    component: EmptyState,
    parameters: {
      docs: {
        description: {
          component:
            'Centered muted empty-state message; add the `actions` snippet when the empty state is an on-ramp.',
        },
      },
    },
  });
</script>

{#snippet template(args: Record<string, any>)}
  <div style="max-width: 480px;"><div class="panel"><EmptyState {...args}>No templates yet — create one on the left.</EmptyState></div></div>
{/snippet}

<Story name="Plain" {template} />

<Story name="With on-ramp actions" asChild>
  <div style="max-width: 480px;">
    <div class="panel">
      <EmptyState>
        No active program. Generate one with AI or build it manually.
        {#snippet actions()}
          <Button href="/clients/1/generate" variant="primary">
            {#snippet icon()}<Icon name="sparkle" />{/snippet}
            Generate first program
          </Button>
          <Button href="/clients/1/programs/new">Write program</Button>
        {/snippet}
      </EmptyState>
    </div>
  </div>
</Story>
