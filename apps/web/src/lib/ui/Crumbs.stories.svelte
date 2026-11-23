<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Crumbs from './Crumbs.svelte';

  const { Story } = defineMeta({
    title: 'UI/Crumbs',
    component: Crumbs,
    parameters: {
      docs: {
        description: {
          component:
            'Breadcrumb trail — the last item without `href` is the current page. Under 860px, and in the home-screen app (`display-mode: standalone`, no browser toolbar), a trail with a link shows `‹ Back` instead: back to where you came from, else to the last linked crumb.',
        },
      },
    },
  });
</script>

{#snippet template(args: Record<string, any>)}
  <Crumbs items={args.items} />
{/snippet}

<Story
  name="Client page"
  {template}
  args={{ items: [{ href: '/clients', label: 'Alex Rivera' }, { label: 'Log session' }] }}
/>
<Story
  name="Program page"
  {template}
  args={{
    items: [
      { href: '/clients', label: 'Clients' },
      { href: '/clients/1', label: 'Alex Rivera' },
      { label: 'Program' },
    ],
  }}
/>
<Story
  name="Phone"
  {template}
  parameters={{ viewport: { defaultViewport: 'narrow' } }}
  args={{
    items: [
      { href: '/clients', label: 'Clients' },
      { href: '/clients/1', label: 'Alex Rivera' },
      { label: 'Program' },
    ],
  }}
/>
<Story name="No link (trail kept on phones)" {template} parameters={{ viewport: { defaultViewport: 'narrow' } }} args={{ items: [{ label: 'Trainers' }, { label: 'Settings' }] }} />
