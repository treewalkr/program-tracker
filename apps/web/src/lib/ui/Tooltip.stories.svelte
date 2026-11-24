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
            'Ink bubble for extra detail — shows after 300ms on hover, at once on keyboard focus, or after a 450ms long press on touch screens; hides on Escape, scroll, or (touch) the next tap anywhere. The child receives the bubble id for aria-describedby.',
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

<!-- Touch screens (iPhone, iPad): press and hold the date for half a second;
     the next tap anywhere hides it, and the hold doesn't press the button. -->
<Story name="Touch: long press">
  <Tooltip text="Sat 7 Nov 2026, 14:39:42 GMT+7">
    {#snippet children(tipId)}
      <button type="button" aria-describedby={tipId}><time datetime="2026-11-07T07:39:42.000Z">7 Nov 2026</time> — hold me</button>
    {/snippet}
  </Tooltip>
</Story>
