<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Skeleton from './Skeleton.svelte';
  import SkeletonPanel from './SkeletonPanel.svelte';
  import SkeletonHead from './SkeletonHead.svelte';

  const { Story } = defineMeta({
    title: 'UI/Skeleton',
    component: Skeleton,
    parameters: {
      docs: {
        description: {
          component:
            'Loading shimmer — one sweep pinned to the viewport so every bar catches it together; fades in after 140ms so fast loads never flash; honors prefers-reduced-motion. Static chrome (panel titles) stays real, only data shimmers.',
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
<Story name="Line" {template} args={{ shape: 'line', h: '12px', w: '60%' }} />
<Story name="Panel" asChild>
  <div style="max-width: 480px;"><SkeletonPanel title="Clients" count rows={4} /></div>
</Story>
<Story name="Panel block" asChild>
  <div style="max-width: 480px;"><SkeletonPanel title="Training week" height={96} /></div>
</Story>
<Story name="Page head" asChild>
  <div style="max-width: 900px;"><SkeletonHead avatar actions={3} tabs={4} /></div>
</Story>
