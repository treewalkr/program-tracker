<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Segmented from './Segmented.svelte';

  const { Story } = defineMeta({
    title: 'UI/Segmented',
    component: Segmented,
    parameters: {
      docs: {
        description: {
          component:
            'Hairline segmented control (radiogroup) for one choice of a few: the placement scope on the program calendar, the builder\'s Weeks toggle. Controlled — the parent owns `value`. Arrow keys move the choice.',
        },
      },
    },
  });
</script>

<script lang="ts">
  let weeks = $state<'same' | 'ab'>('same');
  let scope = $state<'all' | 'one'>('all');
</script>

<Story name="Weeks toggle" asChild>
  <Segmented
    label="Weeks"
    lead="Weeks"
    value={weeks}
    onchange={(v) => (weeks = v)}
    items={[
      { value: 'same', label: 'Same every week' },
      { value: 'ab', label: 'A/B weeks' },
    ]}
  />
</Story>

<Story name="Placement scope" asChild>
  <Segmented
    label="Placement changes apply to"
    lead="Moves apply to"
    value={scope}
    onchange={(v) => (scope = v)}
    items={[
      { value: 'all', label: 'every A week' },
      { value: 'one', label: 'week 3 only' },
    ]}
  />
</Story>
