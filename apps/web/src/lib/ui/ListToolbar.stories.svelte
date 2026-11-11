<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ListToolbar from './ListToolbar.svelte';

  const { Story } = defineMeta({
    title: 'UI/ListToolbar',
    component: ListToolbar,
    parameters: {
      docs: {
        description: {
          component:
            'The row above every list, in a fixed order: search → filters or tabs → sort → result count. The count is a polite live region and only shows while something narrows the list.',
        },
      },
    },
  });
</script>

<script>
  let search = $state('');
  let status = $state('all');
  let sort = $state('name');
</script>

<Story name="Search, filter and sort" asChild>
  <ListToolbar bind:value={search} label="Search clients" placeholder="Search by name or email" count={search || status !== 'all' ? '3 of 19' : undefined}>
    {#snippet filters()}
      <select class="select narrow" bind:value={status} aria-label="Status">
        <option value="all">Any status</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
      </select>
      <select class="select narrow" bind:value={sort} aria-label="Sort clients">
        <option value="name">Sort: Name</option>
        <option value="last">Sort: Last trained</option>
        <option value="recent">Sort: Recently added</option>
      </select>
    {/snippet}
  </ListToolbar>
</Story>

<Story name="With a shortcut key" asChild>
  <ListToolbar value="" label="Search exercises" kbd="/" />
</Story>

<Story name="Narrowed" asChild>
  <ListToolbar value="ada" label="Search clients" count="1 of 19" />
</Story>

<style>
  .narrow {
    width: auto;
  }
</style>
