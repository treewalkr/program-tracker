<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import DirChip from './DirChip.svelte';

  const { Story } = defineMeta({
    title: 'Domain/DirChip',
    component: DirChip,
    parameters: {
      docs: {
        description: {
          component:
            'Periodization directive chip — neutral pill recolored per directive (+volume green, +intensity amber, transition blue).',
        },
      },
    },
  });
</script>

{#snippet template(args: { directive: string } & Record<string, any>)}
  <DirChip {...args}>{args.children ?? args.directive}</DirChip>
{/snippet}

<Story name="Base" {template} args={{ directive: 'base' }} />
<Story name="+volume" {template} args={{ directive: '+volume' }} />
<Story name="+intensity" {template} args={{ directive: '+intensity' }} />
<Story name="Deload" {template} args={{ directive: 'deload' }} />
<Story name="Transition" {template} args={{ directive: 'transition' }} />
<Story name="Test" {template} args={{ directive: 'test' }} />

<Story name="Scheme strip (W-prefixed)" asChild>
  <div style="display: flex; flex-wrap: wrap; gap: 5px;">
    {#each [['1', 'base'], ['2', '+volume'], ['3', '+volume'], ['4', '+intensity'], ['5', 'deload']] as [w, d] (w)}
      <DirChip directive={d}>W{w} {d}</DirChip>
    {/each}
  </div>
</Story>
