<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import PatternChips from './PatternChips.svelte';

  const { Story } = defineMeta({
    title: 'Components/PatternChips',
    component: PatternChips,
    parameters: {
      docs: {
        description: {
          component:
            'Movement-pattern chips for the exercise inspector. The first pick is the primary (★). A secondary is one pill split by a divider: the ☆ segment makes it primary, the label with × removes it — each a 44 px target on touch, so a near-miss on the star never drops the pattern.',
        },
      },
    },
  });
</script>

<script lang="ts">
  let none = $state<string[]>([]);
  let two = $state<string[]>(['knee_dominant', 'hip_dominant']);
</script>

<Story name="Empty" asChild>
  <div style="max-width: 360px;"><PatternChips bind:value={none} /></div>
</Story>

<Story name="Primary and a secondary" asChild>
  <div style="max-width: 360px;"><PatternChips bind:value={two} /></div>
</Story>
