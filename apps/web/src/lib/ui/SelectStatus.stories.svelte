<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import SelectStatus from './SelectStatus.svelte';

  const { Story } = defineMeta({
    title: 'UI/Select/09 Status pill',
    component: SelectStatus,
    parameters: {
      docs: {
        description: {
          component:
            'The value is a soft-tinted Label that already means something; the chevron is the only added mark. Use for program state, signal snooze, session status.',
        },
      },
    },
  });

  const states = [
    { value: 'active', label: 'Active', tone: 'good' as const },
    { value: 'draft', label: 'Draft', tone: 'warn' as const },
    { value: 'archived', label: 'Archived', tone: 'neutral' as const },
  ];
</script>

<script lang="ts">
  let programState = $state<string | undefined>('draft');
  let open = $state(true);
</script>

<Story name="Program state" asChild>
  <div style="min-height: 190px"><SelectStatus label="Program state" options={states} footer="Activating archives the current version." bind:value={programState} bind:open /></div>
</Story>

<Story name="All tones (closed)" asChild>
  <div style="display: flex; gap: 8px">
    <SelectStatus label="State" options={states} value="active" />
    <SelectStatus label="State" options={states} value="draft" />
    <SelectStatus label="State" options={states} value="archived" />
  </div>
</Story>
