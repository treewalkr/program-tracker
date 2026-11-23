<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import BackButton from './BackButton.svelte';

  const { Story } = defineMeta({
    title: 'UI/BackButton',
    component: BackButton,
    parameters: {
      docs: {
        description: {
          component:
            '`‹ Back` for the home-screen app, which has no browser toolbar. Returns to the page you came from (skipping same-page hash and query entries, never onto sign-in), else follows `fallback`, the page\'s parent. A 28px line with a 44px touch target. `Crumbs` swaps to it on phones and in the home-screen app.',
        },
      },
    },
  });
</script>

{#snippet template(args: Record<string, any>)}
  <div style="max-width: 240px">
    <BackButton fallback={args.fallback} label={args.label} />
  </div>
{/snippet}

<Story name="Default" {template} args={{ fallback: '/clients' }} />
<Story name="Custom label" {template} args={{ fallback: '/me', label: 'This week' }} />
<Story
  name="Long label"
  {template}
  args={{ fallback: '/clients/1', label: 'Alexandra Rivera-Montgomery’s programs' }}
/>
