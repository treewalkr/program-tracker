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
            'Hairline segmented control (radiogroup) for one choice of a few (the placement scope on the program calendar, the Weeks toggle); the picked option fills Inverted Ink. Controlled — the parent owns `value`. Arrow keys move the choice. Under 720px or on a touch screen the choices wrap as separate 44px targets (see "Four choices on a phone").',
        },
      },
    },
  });
</script>

<script lang="ts">
  let weeks = $state<'same' | 'ab'>('same');
  let scope = $state<'all' | 'one'>('all');
  let method = $state<'hrmax' | 'karvonen' | 'lthr' | 'custom'>('hrmax');
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

<Story name="Four choices on a phone" asChild>
  <div style="width: 360px; border: 1px dashed var(--line); padding: 8px">
    <Segmented
      label="Zone method"
      lead="Method"
      value={method}
      onchange={(v) => (method = v)}
      items={[
        { value: 'hrmax', label: '% of max HR' },
        { value: 'karvonen', label: 'Heart-rate reserve' },
        { value: 'lthr', label: '% of LTHR' },
        { value: 'custom', label: 'Custom' },
      ]}
    />
  </div>
</Story>
