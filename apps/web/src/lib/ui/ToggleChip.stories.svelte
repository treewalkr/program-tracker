<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ToggleChip from './ToggleChip.svelte';
  import Icon from './Icon.svelte';

  const { Story } = defineMeta({
    title: 'UI/ToggleChip',
    component: ToggleChip,
    parameters: {
      docs: {
        description: {
          component:
            'Hairline pill that inverts to Inverted Ink (#24292f) when selected. Controlled — the parent owns state and toggles in `onclick`. Consolidates the weekday picker, template chips, and exercise filter chips.',
        },
      },
    },
  });
</script>

<script lang="ts">
  // Interactive demo state
  let mon = $state(true);
  let tue = $state(false);
  let upper = $state(true);
</script>

<Story name="Off">Mon</Story>
<Story name="On" args={{ on: true }}>Mon</Story>

<Story name="Weekday group" asChild>
  <div style="display: flex; gap: 6px; flex-wrap: wrap;">
    <ToggleChip on={mon} onclick={() => (mon = !mon)}>Mon</ToggleChip>
    <ToggleChip on={tue} onclick={() => (tue = !tue)}>Tue</ToggleChip>
  </div>
</Story>

<Story name="With check icon" asChild>
  <ToggleChip on={upper} onclick={() => (upper = !upper)}>
    {#if upper}<Icon name="check" />{/if}
    Upper body
  </ToggleChip>
</Story>
