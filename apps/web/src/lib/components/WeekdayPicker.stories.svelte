<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import WeekdayPicker from './WeekdayPicker.svelte';

  const { Story } = defineMeta({
    title: 'Domain/WeekdayPicker',
    component: WeekdayPicker,
    parameters: {
      docs: {
        description: {
          component:
            'ISO weekday toggles (1=Mon … 7=Sun), sorted on toggle. `days` is bindable. Composes the generic ToggleChip primitive.',
        },
      },
    },
  });
</script>

<script>
  let days = $state([1, 3, 5]);
</script>

<Story name="Mon/Wed/Fri" asChild>
  <WeekdayPicker bind:days />
</Story>

<Story name="Empty" asChild>
  <WeekdayPicker days={[]} />
</Story>
