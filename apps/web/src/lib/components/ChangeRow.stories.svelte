<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ChangeRow from './ChangeRow.svelte';

  const { Story } = defineMeta({
    title: 'Domain/ChangeRow',
    component: ChangeRow,
    parameters: {
      docs: {
        description: {
          component:
            'One changed-exercise row: + added (green), − removed (red), ~ changed (blue), with a right-aligned mono detail. Hairline-divided when stacked.',
        },
      },
    },
  });
</script>

{#snippet template(args: { change: 'added' | 'removed' | 'changed'; exercise: string; detail: string })}
  <div class="panel-body">
    <ChangeRow {...args} />
  </div>
{/snippet}

{#snippet realistic()}
  <div class="panel-body">
    <ChangeRow change="added" exercise="Nordic Curl" detail="new — 3×8" />
    <ChangeRow change="changed" exercise="Back Squat" detail="8/8 → 10/8" />
    <ChangeRow change="removed" exercise="Bulgarian Split Squat" detail="was 3×10 (Day 2 — Lower)" />
  </div>
{/snippet}

<Story name="Added" {template} args={{ change: 'added', exercise: 'Nordic Curl', detail: 'new — 3×8' }} />
<Story name="Changed" {template} args={{ change: 'changed', exercise: 'Back Squat', detail: '8/8 → 10/8' }} />
<Story name="Removed" {template} args={{ change: 'removed', exercise: 'Leg Press', detail: 'was 3×12 (Day 3)' }} />
<Story name="Realistic diff" template={realistic} />
