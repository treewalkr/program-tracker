<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import InputCell from './InputCell.svelte';
  import SelectCell from './SelectCell.svelte';
  import SelectStepper from './SelectStepper.svelte';

  const { Story } = defineMeta({
    title: 'UI/Input/04 Quiet cell',
    component: InputCell,
    parameters: {
      docs: {
        description: {
          component:
            'Edit text or a figure inside a dense table or week row. Plain text at rest, aligned with the column; the field appears on hover and takes the full focus ring on focus — the same rhythm as Select 04, so the two share a row. `figure` makes it mono, tabular and right-aligned. Enter commits, Esc reverts to the value it had on focus; `oncommit` fires only when the value changed.',
        },
      },
    },
  });

  const roles = [
    { value: 'main', label: 'Main' },
    { value: 'secondary', label: 'Secondary' },
    { value: 'accessory', label: 'Accessory' },
  ];
  const reps = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15];
  const th = 'text-align: left; padding: 6px 8px; font: 500 11px var(--font-ui); color: var(--muted); background: var(--well); border-bottom: 1px solid var(--line)';
  const td = 'padding: 5px 8px; border-bottom: 1px solid var(--line-soft); vertical-align: middle';
</script>

<script lang="ts">
  let note = $state('Pause 2 s at the bottom');
  let load = $state('102.5');
  let blank = $state('');
  let committed = $state('');
  let rows = $state([
    { name: 'Back squat', role: 'main' as string | undefined, reps: 5, load: '102.5', note: 'Pause 2 s at the bottom' },
    { name: 'Romanian deadlift', role: 'secondary' as string | undefined, reps: 8, load: '80', note: '' },
    { name: 'Leg curl', role: 'accessory' as string | undefined, reps: 12, load: '35', note: 'Slow eccentric' },
  ]);
</script>

<Story name="Text cell" asChild>
  <div style="max-width: 280px; padding: 0 6px">
    <InputCell label="Notes for Back squat" bind:value={note} oncommit={(v) => (committed = v)} />
    <p style="margin: 8px 0 0; font-size: 12px; color: var(--muted)">Last commit: {committed || 'none yet'}</p>
  </div>
</Story>

<Story name="Figure cell" asChild>
  <div style="padding: 0 6px"><InputCell label="Load for Back squat, kg" bind:value={load} figure width={6} /></div>
</Story>

<Story name="Empty" asChild>
  <div style="max-width: 280px; padding: 0 6px"><InputCell label="Notes for Leg curl" bind:value={blank} placeholder="Add note" /></div>
</Story>

<Story name="In a table row" asChild>
  <table style="width: 100%; max-width: 680px; border-collapse: collapse; font-size: 14px">
    <thead>
      <tr>
        <th style={th}>Exercise</th>
        <th style={th}>Role</th>
        <th style={th}>Reps</th>
        <th style="{th}; text-align: right">kg</th>
        <th style={th}>Note</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r.name)}
        <tr>
          <td style={td}>{r.name}</td>
          <td style={td}><SelectCell label="Role for {r.name}" options={roles} bind:value={r.role} /></td>
          <td style={td}><SelectStepper label="Reps for {r.name}" values={reps} bind:value={r.reps} unit="reps" /></td>
          <td style="{td}; text-align: right"><InputCell label="Load for {r.name}, kg" bind:value={r.load} figure width={6} /></td>
          <td style={td}><InputCell label="Note for {r.name}" bind:value={r.note} placeholder="Add note" /></td>
        </tr>
      {/each}
    </tbody>
  </table>
</Story>
