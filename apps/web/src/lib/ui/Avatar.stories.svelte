<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Avatar from './Avatar.svelte';

  const { Story } = defineMeta({
    title: 'UI/Avatar',
    component: Avatar,
    parameters: {
      docs: {
        description: {
          component: 'Initials avatar — first letters of the first two name parts, uppercased.',
        },
      },
    },
  });
</script>

{#snippet template(args: { name: string })}
  <Avatar {...args} />
{/snippet}

<Story name="Two names" {template} args={{ name: 'Alex Rivera' }} />
<Story name="Three names" {template} args={{ name: 'Maya Kim Johnson' }} />
<Story name="Single name" {template} args={{ name: 'Svetlana' }} />
<Story name="Lowercase" {template} args={{ name: 'jo march' }} />
