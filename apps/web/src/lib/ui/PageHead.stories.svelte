<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import PageHead from './PageHead.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';

  const { Story } = defineMeta({
    title: 'UI/PageHead',
    component: PageHead,
    parameters: {
      docs: {
        description: {
          component: 'Page opener — crumbs, headline (+ optional status-pill suffix), `.sub` context line, right-aligned actions.',
        },
      },
    },
  });
</script>

{#snippet template(args: { title: string } & Record<string, any>)}
  <PageHead {...args} />
{/snippet}

<Story name="Overview" {template} args={{ title: 'This week', sub: 'Monday — 3 clients due today.' }} />

<Story name="With actions" asChild>
  <PageHead title="Clients" sub="Your book of athletes.">
    {#snippet actions()}
      <Button href="/clients/new" variant="primary">
        {#snippet icon()}<Icon name="plus" />{/snippet}
        Add client
      </Button>
    {/snippet}
  </PageHead>
</Story>

<Story name="Wrapping actions" asChild>
  <PageHead title="Feedback" sub="Wide buttons wrap on a phone instead of scrolling." wrapActions>
    {#snippet actions()}
      <Button>New ticket</Button>
      <Button>Open export</Button>
      <Button variant="primary">Copy 12 for agent</Button>
    {/snippet}
  </PageHead>
</Story>

<Story name="With crumbs + pill" asChild>
  <PageHead
    title="Block A — strength"
    sub="Saved as draft — nothing goes live until you activate it."
    crumbs={[{ href: '/clients', label: 'Alex Rivera' }, { label: 'Program' }]}
  >
    {#snippet titleSuffix()}<StatusPill status="draft" />{/snippet}
  </PageHead>
</Story>
