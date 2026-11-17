<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SelectField from './SelectField.svelte';

  const { Story } = defineMeta({
    title: 'UI/Select/01 Primer field',
    component: SelectField,
    parameters: {
      docs: {
        description: {
          component:
            'The form default: reads as a text input with a chevron, so a form column stays one shape. Use for profile and settings forms, and filters with 3–8 options. Arrow keys open and move, Enter or Space picks, Esc closes.',
        },
      },
    },
  });

  const goals = [
    { value: 'strength', label: 'Strength' },
    { value: 'hypertrophy', label: 'Hypertrophy' },
    { value: 'power', label: 'Power' },
    { value: 'general', label: 'General fitness' },
  ];
</script>

<script lang="ts">
  let goal = $state<string | undefined>('hypertrophy');
  let none = $state<string | undefined>();
  let open = $state(true);
</script>

<Story name="Closed" asChild>
  <div style="max-width: 300px"><SelectField label="Primary goal" options={goals} bind:value={goal} /></div>
</Story>

<Story name="Open" asChild>
  <div style="max-width: 300px; min-height: 220px"><SelectField label="Primary goal" options={goals} bind:value={goal} bind:open /></div>
</Story>

<Story name="Error (nothing chosen)" asChild>
  <div style="max-width: 300px"><SelectField label="Primary goal" options={goals} bind:value={none} placeholder="Choose a goal" invalid /></div>
</Story>

<Story name="Disabled" asChild>
  <div style="max-width: 300px"><SelectField label="Primary goal" options={goals} value="general" disabled /></div>
</Story>
