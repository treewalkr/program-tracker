<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SelectDescribed from './SelectDescribed.svelte';

  const { Story } = defineMeta({
    title: 'UI/Select/07 Described options',
    component: SelectDescribed,
    parameters: {
      docs: {
        description: {
          component:
            'Two lines per option: name, then what it does. For choices where the label alone invites a wrong pick — session type, progression scheme, AI provider and effort.',
        },
      },
    },
  });

  const schemes = [
    { value: 'double', label: 'Double progression', description: 'Add reps to the top of the range, then load.' },
    { value: 'linear', label: 'Linear load', description: 'Fixed jump each session. Novice lifters.' },
    { value: 'rpe', label: 'RPE autoregulated', description: 'Load follows the logged RPE of the last set.' },
  ];
</script>

<script lang="ts">
  let scheme = $state<string | undefined>('double');
  let open = $state(true);
</script>

<Story name="Progression scheme" asChild>
  <div style="max-width: 340px; min-height: 260px"><SelectDescribed label="Progression scheme" options={schemes} bind:value={scheme} bind:open /></div>
</Story>
