<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Skeleton from './Skeleton.svelte';
  import SkeletonPanel from './SkeletonPanel.svelte';

  const { Story } = defineMeta({
    title: 'UI/Skeleton',
    component: Skeleton,
    parameters: {
      docs: {
        description: {
          component:
            'Loading shimmer — the sole animation besides button transitions; honors prefers-reduced-motion.',
        },
      },
    },
  });
</script>

{#snippet template(args: Record<string, any>)}
  <div style="max-width: 420px;"><Skeleton {...args} /></div>
{/snippet}

<Story name="Bar" {template} args={{ h: '16px' }} />
<Story name="Block" {template} args={{ h: '80px' }} />
<Story name="Panel" asChild>
  <div style="max-width: 480px;"><SkeletonPanel height={96} /></div>
</Story>
