<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Tooltip from './Tooltip.svelte';

  const { Story } = defineMeta({
    title: 'UI/Tooltip',
    component: Tooltip,
    parameters: {
      docs: {
        description: {
          component:
            'Ink bubble for extra detail — shows after 300ms on hover, at once on keyboard focus, hides on Escape or scroll. The child receives the bubble id for aria-describedby.',
        },
      },
    },
  });
</script>

<Story name="Full date on a short date">
  <Tooltip text="Sat 7 Nov 2026, 14:39:42 GMT+7">
    {#snippet children(tipId)}
      <button type="button" aria-describedby={tipId}><time datetime="2026-11-07T07:39:42.000Z">7 Nov 2026</time></button>
    {/snippet}
  </Tooltip>
</Story>

<Story name="Right side (sidebar rail)">
  <Tooltip text="Exercise library" side="right">
    {#snippet children()}
      <a href="/exercises" aria-label="Exercise library" style="display: grid; place-items: center; width: 32px; height: 32px">EL</a>
    {/snippet}
  </Tooltip>
</Story>
