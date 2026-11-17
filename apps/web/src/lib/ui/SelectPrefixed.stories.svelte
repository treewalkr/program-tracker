<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SelectPrefixed from './SelectPrefixed.svelte';

  const { Story } = defineMeta({
    title: 'UI/Select/03 Prefixed field',
    component: SelectPrefixed,
    parameters: {
      docs: {
        description: {
          component:
            'The label sits inside, in a well-deep cap. Saves a row of height and survives a toolbar. Use for list toolbars and filter bars: Sort, Status, Pattern.',
        },
      },
    },
  });

  const sorts = [
    { value: 'trained', label: 'Last trained' },
    { value: 'name', label: 'Name A–Z' },
    { value: 'ending', label: 'Block ending soonest' },
    { value: 'adherence', label: 'Adherence, lowest first' },
  ];
  const patterns = [
    { value: 'all', label: 'All patterns' },
    { value: 'squat', label: 'Squat' },
    { value: 'hinge', label: 'Hinge' },
    { value: 'push', label: 'Push' },
    { value: 'pull', label: 'Pull' },
  ];
</script>

<script lang="ts">
  let sort = $state<string | undefined>('trained');
  let pattern = $state<string | undefined>('all');
  let open = $state(true);
</script>

<Story name="Open" asChild>
  <div style="max-width: 300px; min-height: 220px"><SelectPrefixed prefix="Sort" options={sorts} bind:value={sort} bind:open /></div>
</Story>

<Story name="Toolbar" asChild>
  <div style="display: flex; gap: 8px; flex-wrap: wrap; min-height: 240px">
    <div style="width: 240px"><SelectPrefixed prefix="Sort" options={sorts} bind:value={sort} /></div>
    <div style="width: 220px"><SelectPrefixed prefix="Pattern" options={patterns} bind:value={pattern} /></div>
  </div>
</Story>
