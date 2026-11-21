<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import InputSearch from './InputSearch.svelte';
  import SelectPrefixed from './SelectPrefixed.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  const { Story } = defineMeta({
    title: 'UI/Input/03 Search field',
    component: InputSearch,
    parameters: {
      docs: {
        description: {
          component:
            'Search or filter a list in a toolbar. Leading search icon; while empty, the shortcut key sits inside as a kbd chip; once filled, a mono "12 of 140" count and a round clear button. Esc clears, and Esc on an empty field leaves it. There is no debounce inside: the caller owns it (ListToolbar waits 250ms). Sits in one 32px row with Select 03 and a button.',
        },
      },
    },
  });

  const sorts = [
    { value: 'recent', label: 'Recently active' },
    { value: 'name', label: 'Name' },
    { value: 'due', label: 'Review due' },
  ];
  const clients = ['Ann Rattanakul', 'Ben Okafor', 'Chai Srisuk', 'Dana Ivers', 'Eli Moreau', 'Fon Charoen', 'Gus Lindqvist', 'Hana Sato'];
</script>

<script lang="ts">
  let empty = $state('');
  let filled = $state('squat');
  let none = $state('zercher hold');
  let query = $state('');
  let sort = $state<string | undefined>('recent');
  let input = $state<HTMLInputElement>();
  const shown = $derived(clients.filter((c) => c.toLowerCase().includes(query.trim().toLowerCase())));

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (e.key === '/' && !t.closest('input, textarea, [contenteditable]')) {
      e.preventDefault();
      input?.focus();
    }
  }
</script>

<Story name="Empty with /" exportName="EmptyWithShortcut" asChild>
  <div style="max-width: 320px"><InputSearch label="Search exercises" bind:value={empty} shortcut="/" /></div>
</Story>

<Story name="Filled with count" asChild>
  <div style="max-width: 320px"><InputSearch label="Search exercises" bind:value={filled} shortcut="/" count="12 of 140" /></div>
</Story>

<Story name="No match" asChild>
  <div style="max-width: 320px"><InputSearch label="Search exercises" bind:value={none} shortcut="/" count="0 of 140" /></div>
</Story>

<svelte:window {onkeydown} />

<Story name="In a toolbar" asChild>
  <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; max-width: 720px">
    <div style="flex: 1 1 240px; max-width: 320px">
      <InputSearch label="Search clients" bind:value={query} bind:input shortcut="/" count="{shown.length} of {clients.length}" />
    </div>
    <div style="width: 220px"><SelectPrefixed prefix="Sort" options={sorts} bind:value={sort} /></div>
    <div style="margin-left: auto">
      <Button>{#snippet icon()}<Icon name="plus" />{/snippet}New client</Button>
    </div>
  </div>
  <ul style="margin: 12px 0 0; padding: 0; list-style: none; font-size: 14px; max-width: 720px">
    {#each shown as c (c)}<li style="padding: 6px 0; border-bottom: 1px solid var(--line-soft)">{c}</li>{/each}
  </ul>
</Story>
