<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import StatTile from './StatTile.svelte';

  const { Story } = defineMeta({
    title: 'UI/StatTile',
    component: StatTile,
    parameters: {
      docs: { description: { component: 'One figure with its label and a muted line of context. Lay several in a grid (the member Cardio tab uses four).' } },
    },
  });
</script>

<Story name="A row of four" asChild>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; max-width: 760px">
    <StatTile label="Sessions this week" value="3" of="of 3" />
    <StatTile label="Time" value="2:15" sub="plan 2:13" />
    <StatTile label="Session load" value="546" sub="target 600 AU" />
    <StatTile label="Completion · 4 wks" value="92%" sub="11 of 12 sessions" />
  </div>
</Story>
