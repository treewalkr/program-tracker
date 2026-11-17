<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SelectMulti from './SelectMulti.svelte';

  const { Story } = defineMeta({
    title: 'UI/Select/10 Token multi-select',
    component: SelectMulti,
    parameters: {
      docs: {
        description: {
          component:
            'Chosen items become blue tokens with a remove mark. The list uses checkboxes and stays open while you pick. Use for equipment, limitations, muscle focus, session days.',
        },
      },
    },
  });

  const equipment = ['Barbell', 'Dumbbell', 'Cable', 'Kettlebell', 'Bands'].map((l) => ({ value: l.toLowerCase(), label: l }));
</script>

<script lang="ts">
  let picked = $state<string[]>(['barbell', 'dumbbell', 'cable']);
  let empty = $state<string[]>([]);
  let open = $state(true);
</script>

<Story name="Equipment (open)" asChild>
  <div style="max-width: 340px; min-height: 280px"><SelectMulti label="Equipment" options={equipment} bind:value={picked} bind:open /></div>
</Story>

<Story name="Empty" asChild>
  <div style="max-width: 340px; min-height: 280px"><SelectMulti label="Equipment" placeholder="Choose equipment…" options={equipment} bind:value={empty} /></div>
</Story>
