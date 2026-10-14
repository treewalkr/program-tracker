<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Counter from './Counter.svelte';

  const { Story } = defineMeta({
    title: 'UI/Counter',
    component: Counter,
    parameters: {
      docs: {
        description: {
          component:
            'Count pill beside a heading or tab — cites the evidence behind it. Counts are labels, not figures: no mono/tabular treatment.',
        },
      },
    },
  });
</script>

{#snippet template(args: { value: string | number } & Record<string, any>)}
  <h2 style="display: inline-flex; align-items: center; gap: 8px;">Needs review <Counter {...args} /></h2>
{/snippet}

<Story name="Number" {template} args={{ value: 3 }} />
<Story name="Text" {template} args={{ value: '9 of 12 logged' }} />
