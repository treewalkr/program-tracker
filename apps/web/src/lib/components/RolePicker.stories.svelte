<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { mergeRoleLabels, type ExerciseRole } from '@pt/shared';
  import RolePicker from './RolePicker.svelte';

  const { Story } = defineMeta({
    title: 'Domain/RolePicker',
    component: RolePicker,
    parameters: {
      docs: {
        description: {
          component:
            'The role pill at the head of an exercise. Opens a searchable list grouped by category (priority, training quality, body region, then the trainer’s own labels); “+ New label” makes one from the query, the pencil (or Shift+Enter) edits a label’s meaning.',
        },
      },
    },
  });

  const withOwn = mergeRoleLabels([
    { id: '11111111-1111-4111-8111-111111111111', builtinKey: null, name: 'Speed', chip: 'Spd', description: 'Fast, light reps done fresh.', rank: 150, archivedAt: null },
  ]);
</script>

<script lang="ts">
  let role = $state<ExerciseRole | undefined>(undefined);
</script>

<Story name="Unset" asChild>
  <RolePicker value={role} onpick={(r) => (role = r)} />
</Story>

<Story name="Primary" args={{ value: 'primary', onpick: () => {} }} />
<Story name="Strength" args={{ value: 'strength', onpick: () => {} }} />

<Story name="With the trainer’s labels" asChild>
  <RolePicker value="label:11111111-1111-4111-8111-111111111111" labels={withOwn} onpick={() => {}} editable={false} />
</Story>
