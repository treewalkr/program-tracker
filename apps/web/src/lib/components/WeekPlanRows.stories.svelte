<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { SCHEME_PRESETS } from '@pt/shared';
  import { weekPlansToRows } from '$lib/phasing';
  import WeekPlanRows from './WeekPlanRows.svelte';

  const { Story } = defineMeta({
    title: 'Domain/WeekPlanRows',
    component: WeekPlanRows,
    parameters: {
      docs: {
        description: {
          component:
            'Week-by-week scheme editor as a sheet: one line per week under a header on a wide container; push / target / rule stacked under the week number on a narrow one.',
        },
      },
    },
  });
</script>

<script lang="ts">
  let wide = $state(weekPlansToRows(SCHEME_PRESETS[1].weeks));
  let narrow = $state(weekPlansToRows(SCHEME_PRESETS[0].weeks));
</script>

<Story name="Wide (block preset)" asChild>
  <div style="max-width: 960px;"><WeekPlanRows bind:rows={wide} /></div>
</Story>

<Story name="Narrow (phone width)" asChild>
  <div style="max-width: 366px;"><WeekPlanRows bind:rows={narrow} /></div>
</Story>
