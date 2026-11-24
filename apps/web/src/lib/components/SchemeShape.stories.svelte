<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { SCHEME_PRESETS } from '@pt/shared';
  import SchemeShape from './SchemeShape.svelte';

  const { Story } = defineMeta({
    title: 'Domain/SchemeShape',
    component: SchemeShape,
    parameters: { docs: { description: { component: "A scheme's silhouette: one column per week, height = planned volume chained from the targets (week 1 = 100), tinted by directive." } } },
  });
</script>

<Story name="Every preset" asChild>
  <div style="display: grid; gap: 16px; max-width: 560px;">
    {#each SCHEME_PRESETS as p (p.key)}
      <div>
        <p style="margin: 0 0 6px; font-weight: 600;">{p.name}</p>
        <SchemeShape weeks={p.weeks} scale={200} />
      </div>
    {/each}
  </div>
</Story>
