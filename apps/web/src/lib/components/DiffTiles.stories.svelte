<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import DiffTiles from './DiffTiles.svelte';

  const { Story } = defineMeta({
    title: 'Domain/DiffTiles',
    component: DiffTiles,
    parameters: {
      docs: {
        description: {
          component:
            '2×2 change-summary tiles for the AI draft diff panel. Mono counters colour-coded: kept muted, added green, removed red, changed blue.',
        },
      },
    },
  });
</script>

{#snippet template(args: { kept: number; added: number; removed: number; changed: number })}
  <div class="panel-body">
    <DiffTiles {...args} />
  </div>
{/snippet}

<Story name="Balanced block" {template} args={{ kept: 4, added: 2, removed: 1, changed: 3 }} />
<Story name="All kept" {template} args={{ kept: 9, added: 0, removed: 0, changed: 0 }} />
