<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SelectCell from './SelectCell.svelte';

  const { Story } = defineMeta({
    title: 'UI/Select/04 Quiet cell',
    component: SelectCell,
    parameters: {
      docs: {
        description: {
          component:
            'Plain text until hover or focus, then the field appears and the chevron fades in. Keeps dense tables scannable. Use for inline edits in session and week tables.',
        },
      },
    },
  });

  const roles = [
    { value: 'main', label: 'Main' },
    { value: 'secondary', label: 'Secondary' },
    { value: 'accessory', label: 'Accessory' },
  ];
</script>

<script lang="ts">
  let rows = $state<{ name: string; role: string | undefined; rest: string }[]>([
    { name: 'Back squat', role: 'main', rest: '180 s' },
    { name: 'Romanian deadlift', role: 'secondary', rest: '120 s' },
    { name: 'Leg curl', role: 'accessory', rest: '90 s' },
  ]);
</script>

<Story name="In a table" asChild>
  <table style="width: 100%; max-width: 480px; border-collapse: collapse; font-size: 13px; min-height: 220px">
    <thead>
      <tr>
        {#each ['Exercise', 'Role', 'Rest'] as h}
          <th style="text-align: left; padding: 6px 8px; font: 500 11px var(--font-ui); color: var(--muted); background: var(--well); border-bottom: 1px solid var(--line)">{h}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r.name)}
        <tr>
          <td style="padding: 5px 8px; border-bottom: 1px solid var(--line-soft)">{r.name}</td>
          <td style="padding: 5px 8px 5px 14px; border-bottom: 1px solid var(--line-soft)">
            <SelectCell label="Role for {r.name}" options={roles} bind:value={r.role} />
          </td>
          <td style="padding: 5px 8px; border-bottom: 1px solid var(--line-soft); font: 500 12px var(--font-mono)">{r.rest}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</Story>
