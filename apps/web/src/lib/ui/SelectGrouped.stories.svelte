<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SelectGrouped from './SelectGrouped.svelte';

  const { Story } = defineMeta({
    title: 'UI/Select/08 Grouped list',
    component: SelectGrouped,
    parameters: {
      docs: {
        description: {
          component:
            'Sticky group headings with counters, an avatar and a quiet right-hand fact: the list answers "who" before you read it. Use for the client switcher, move-to-client, copy week from.',
        },
      },
    },
  });

  const clients = [
    { value: 'mali', label: 'Mali Pongsakul', avatar: 'MP', group: 'Needs review', hint: 'block ending' },
    { value: 'nat', label: 'Nat Kittisak', avatar: 'NK', group: 'Needs review', hint: 'RPE creep' },
    { value: 'arm', label: 'Arm Tanakorn', avatar: 'AT', group: 'On plan', hint: 'Wed' },
    { value: 'pim', label: 'Pim Sirikul', avatar: 'PS', group: 'On plan', hint: 'Thu' },
  ];
</script>

<script lang="ts">
  let client = $state<string | undefined>('mali');
  let open = $state(true);
</script>

<Story name="Client switcher" asChild>
  <div style="max-width: 340px; min-height: 280px"><SelectGrouped label="Client" options={clients} bind:value={client} bind:open /></div>
</Story>
