<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { SCHEME_PRESETS } from '@pt/shared';
  import SchemeScore from './SchemeScore.svelte';

  const { Story } = defineMeta({
    title: 'Domain/SchemeScore',
    component: SchemeScore,
    parameters: { docs: { description: { component: "A scheme read week by week: push, volume and intensity targets (% vs the week before), the progression rule, and each week's note." } } },
  });
</script>

<Story name="Every preset" asChild>
  <div style="display: grid; gap: 16px; max-width: 560px;">
    {#each SCHEME_PRESETS as p (p.key)}
      <div>
        <p style="margin: 0 0 6px; font-weight: 600;">{p.name}</p>
        <SchemeScore weeks={p.weeks} name={p.name} />
      </div>
    {/each}
  </div>
</Story>
