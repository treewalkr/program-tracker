<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SelectButtonPanel from './SelectButtonPanel.svelte';

  const { Story } = defineMeta({
    title: 'UI/Select/02 Button panel',
    component: SelectButtonPanel,
    parameters: {
      docs: {
        description: {
          component:
            'A button with a muted key and the value. Opens a titled panel whose footer says what choosing does. Use for page-level scope: client, program version, week switcher.',
        },
      },
    },
  });

  const weeks = [
    { value: '2', label: 'Week 2 · +volume', hint: 'done' },
    { value: '3', label: 'Week 3 · +intensity', hint: 'this week' },
    { value: '4', label: 'Week 4 · deload', hint: 'next' },
  ];
  const clients = [
    { value: 'mali', label: 'Mali P.', avatar: 'MP' },
    { value: 'nat', label: 'Nat K.', avatar: 'NK' },
    { value: 'arm', label: 'Arm T.', avatar: 'AT' },
  ];
</script>

<script lang="ts">
  let week = $state<string | undefined>('3');
  let client = $state<string | undefined>('mali');
  let open = $state(true);
</script>

<Story name="Week switcher" asChild>
  <div style="min-height: 240px">
    <SelectButtonPanel label="Week" title="Switch week" note="v2 · active" footer="Only changes the view. Nothing is edited." options={weeks} bind:value={week} bind:open />
  </div>
</Story>

<Story name="Client with avatar" asChild>
  <div style="min-height: 220px">
    <SelectButtonPanel label="Client" title="Switch client" options={clients} bind:value={client} />
  </div>
</Story>
