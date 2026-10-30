<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import PhasingEditor from "./PhasingEditor.svelte";
  import type { ProgramPhasingDto } from "$lib/api/types";

  const { Story } = defineMeta({
    title: "Domain/PhasingEditor",
    component: PhasingEditor,
    parameters: {
      docs: {
        description: {
          component: "Periodization plan (phasing) editor with week directives, metric targets, and planned weeks display.",
        },
      },
    },
  });
</script>

<script lang="ts">
  let samplePhasing = $state<ProgramPhasingDto | null>({
    plannedWeeks: 4,
    phase: "accumulation",
    nextPhase: "intensification",
    weeks: [
      { week: 1, directive: "base" },
      { week: 2, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 } },
      { week: 3, directive: "+intensity", target: { metric: "intensity", deltaPercent: 2.5 } },
      { week: 4, directive: "deload" },
    ],
  });

  let nullPhasing = $state<ProgramPhasingDto | null>(null);
</script>

<Story name="Active Phasing" asChild>
  <PhasingEditor bind:phasing={samplePhasing} weeksCount={4} />
</Story>

<Story name="Disabled Phasing" asChild>
  <PhasingEditor bind:phasing={nullPhasing} weeksCount={4} />
</Story>
