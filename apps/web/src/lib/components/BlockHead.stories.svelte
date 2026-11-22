<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import BlockHead from './BlockHead.svelte';

  const { Story } = defineMeta({
    title: 'Domain/BlockHead',
    component: BlockHead,
    parameters: {
      docs: {
        description: {
          component:
            'Head of a session block. Movement prep is optional, short and never counted; Main work is what every set count, balance and progress reads. The role chip and the block are separate.',
        },
      },
    },
  });
</script>

<Story name="Movement prep" args={{ block: 'prep' }} />
<Story name="Main work" args={{ block: 'main' }} />
<Story name="Portal checklist" args={{ block: 'prep', tag: 'tick when done' }}>
  {#snippet template(args)}
    <BlockHead {...args}><span class="tnum">2/4</span></BlockHead>
  {/snippet}
</Story>
<Story name="No tag" args={{ block: 'main', tag: null }} />
