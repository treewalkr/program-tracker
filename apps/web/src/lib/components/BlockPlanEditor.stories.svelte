<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import type { ProgramPhasingDto } from '$lib/api/types';
  import { defaultPlan } from '$lib/draftReview';
  import BlockPlanEditor from './BlockPlanEditor.svelte';

  const { Story } = defineMeta({
    title: 'Domain/BlockPlanEditor',
    component: BlockPlanEditor,
    parameters: {
      docs: {
        description: {
          component:
            "Edit a draft's block plan by hand — directive, % target and note per week, add/remove weeks, phase names. The strip previews the result; out-of-range targets block Save. Saving creates the next version (no AI).",
        },
      },
    },
  });

  const plan: ProgramPhasingDto = {
    phase: 'accumulation',
    nextPhase: 'intensification',
    plannedWeeks: 4,
    weeks: [
      { week: 1, directive: 'base' },
      { week: 2, directive: '+volume', target: { metric: 'overall_volume', deltaPercent: 5 } },
      { week: 3, directive: '+intensity' },
      { week: 4, directive: 'deload', target: { metric: 'overall_volume', deltaPercent: -40 } },
    ],
  };
  const noop = () => {};
</script>

<Story name="Existing plan (one warning)" args={{ phasing: plan, nextVersion: 5, onsave: noop, oncancel: noop }} />
<Story name="New plan from default" args={{ phasing: defaultPlan(4), nextVersion: 2, onsave: noop, oncancel: noop }} />
<Story name="Save error" args={{ phasing: plan, nextVersion: 5, error: 'phasing is unchanged', onsave: noop, oncancel: noop }} />
