<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import type { ProgramPhasingDto } from '$lib/api/types';
  import BlockPlanStrip from './BlockPlanStrip.svelte';

  const { Story } = defineMeta({
    title: 'Domain/BlockPlanStrip',
    component: BlockPlanStrip,
    parameters: {
      docs: {
        description: {
          component:
            "A block's weeks as tiles: directive, % target, and a bar for the volume index chained from the targets (W1 = 100), with the load index underneath. A deload week dips load 10 % and the following week resumes from pre-deload values. Picking a tile shows its note. Edited weeks get a blue outline.",
        },
      },
    },
  });

  const plan: ProgramPhasingDto = {
    phase: 'accumulation',
    nextPhase: 'intensification',
    plannedWeeks: 6,
    weeks: [
      { week: 1, directive: 'base', note: 'Learn the movements, establish honest 5×5 loads at RPE ≤8.' },
      { week: 2, directive: '+volume', target: { metric: 'overall_volume', deltaPercent: 5 }, note: 'Add one set to the main lower lifts.' },
      { week: 3, directive: '+intensity', target: { metric: 'intensity', deltaPercent: 2.5 }, note: 'Hold volume, nudge top-set load ~2.5%.' },
      { week: 4, directive: '+volume', target: { metric: 'overall_volume', deltaPercent: 5 }, note: 'Second volume wave.' },
      { week: 5, directive: '+intensity', target: { metric: 'intensity', deltaPercent: 2.5 }, note: 'Heaviest week of the block.' },
      { week: 6, directive: 'deload', target: { metric: 'overall_volume', deltaPercent: -55 }, note: 'Half the sets, loads −10%, arrive fresh.' },
    ],
  };
</script>

<Story name="Six-week block" args={{ phasing: plan }} />
<Story name="Edited week" args={{ phasing: plan, selected: 4, changed: new Set([4]) }} />
