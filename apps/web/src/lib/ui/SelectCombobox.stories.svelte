<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SelectCombobox from './SelectCombobox.svelte';

  const { Story } = defineMeta({
    title: 'UI/Select/06 Search combobox',
    component: SelectCombobox,
    parameters: {
      docs: {
        description: {
          component:
            'Type to filter, matches highlighted, arrow keys to move, a tag on the right says where the item comes from. Use for the exercise picker and any list over about 12 items. Pass `oncreate` to end the list with an "Add" row, and `emptyText` to say what is missing when nothing matches.',
        },
      },
    },
  });
</script>

<script lang="ts">
  let options = $state([
    { value: 'back-squat', label: 'Squat, back', tag: 'Library' },
    { value: 'front-squat', label: 'Front squat', tag: 'Library' },
    { value: 'goblet-squat', label: 'Goblet squat', tag: 'Library' },
    { value: 'belt-squat', label: "Belt squat, Mali's cue", tag: 'Custom' },
    { value: 'rdl', label: 'Romanian deadlift', tag: 'Library' },
    { value: 'bench', label: 'Bench press', tag: 'Library' },
    { value: 'row', label: 'Barbell row', tag: 'Library' },
    { value: 'ohp', label: 'Overhead press', tag: 'Library' },
  ]);
  let value = $state<string | undefined>();
  const clients = ['Ann Rattanakul', 'Mali Srisuk', 'Pim Chaiyo', 'Krit Wong', 'Nok Somchai'].map((name, i) => ({ value: `c${i}`, label: name }));
  let client = $state<string | undefined>();
  const muscles = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Adductors', 'Abductors', 'Hip flexors', 'Neck', 'Full body'].map((m) => ({ value: m.toLowerCase(), label: m }));
  let muscle = $state<string | undefined>('quads');

  function create(name: string) {
    const v = name.toLowerCase().replace(/\W+/g, '-');
    options = [...options, { value: v, label: name, tag: 'Custom' }];
    value = v;
  }
</script>

<Story name="Library + custom" asChild>
  <div style="max-width: 340px; min-height: 300px">
    <SelectCombobox label="Exercise" placeholder="Search exercises…" {options} bind:value oncreate={create} createLabel={(q) => `Add “${q}” as a custom exercise`} />
  </div>
</Story>

<Story name="Without create" asChild>
  <div style="max-width: 340px; min-height: 300px">
    <SelectCombobox label="Exercise" placeholder="Search exercises…" {options} bind:value />
  </div>
</Story>

<Story name="Clients, own empty text" asChild>
  <div style="max-width: 340px; min-height: 300px">
    <SelectCombobox label="Client" placeholder="Choose a client…" options={clients} bind:value={client} emptyText="No clients match" />
  </div>
</Story>

<Story name="Plain list over 12" asChild>
  <div style="max-width: 340px; min-height: 300px">
    <SelectCombobox label="Primary muscle" placeholder="Search muscles…" options={muscles} bind:value={muscle} emptyText="No muscles match" />
  </div>
</Story>

<Story name="Near the bottom of the screen" asChild>
  <!-- The list opens upward when there's no room below, and re-fits when the on-screen keyboard shrinks the screen. -->
  <div style="max-width: 340px; height: calc(100vh - 32px); display: flex; flex-direction: column; justify-content: flex-end">
    <SelectCombobox label="Primary muscle" placeholder="Search muscles…" options={muscles} bind:value={muscle} emptyText="No muscles match" />
  </div>
</Story>
