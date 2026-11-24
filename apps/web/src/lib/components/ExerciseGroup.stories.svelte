<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ExerciseGroup from './ExerciseGroup.svelte';

  const { Story } = defineMeta({
    title: 'Components/ExerciseGroup',
    component: ExerciseGroup,
    parameters: {
      docs: {
        description: {
          component:
            'The superset / circuit box around its members. With the edit callbacks the rounds become a cell and ↑ ↓ Ungroup appear; on a narrow screen they wrap to their own line (never off the edge) and are 44 px targets on touch.',
        },
      },
    },
  });
</script>

{#snippet members()}
  <p style="margin:0">A1 · Back Squat — 8 reps</p>
  <p style="margin:0">A2 · Romanian Deadlift — 10 reps</p>
{/snippet}

<Story name="Read only" asChild>
  <div style="max-width: 480px;"><ExerciseGroup group="A" count={2} rounds={3} children={members} /></div>
</Story>

<Story name="Editable" asChild>
  <div style="max-width: 480px;">
    <ExerciseGroup group="A" count={2} rounds={3} onrounds={() => {}} onmoveup={() => {}} onmovedown={() => {}} onungroup={() => {}} canMoveUp canMoveDown children={members} />
  </div>
</Story>

<!-- iPhone SE inside a session: the actions wrap under the title instead of pushing Ungroup off-screen. -->
<Story name="Editable · 236 px" asChild>
  <div style="width: 236px;">
    <ExerciseGroup group="B" count={3} rounds={4} onrounds={() => {}} onmoveup={() => {}} onmovedown={() => {}} onungroup={() => {}} canMoveUp children={members} />
  </div>
</Story>
