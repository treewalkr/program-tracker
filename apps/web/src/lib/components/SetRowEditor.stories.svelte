<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import SetRowEditor from "./SetRowEditor.svelte";
  import type { PrescribedSetDto } from "$lib/api/types";

  const { Story } = defineMeta({
    title: "Domain/SetRowEditor",
    component: SetRowEditor,
    parameters: {
      docs: {
        description: {
          component: "Direct-input set row editor matching builder parity.",
        },
      },
    },
  });
</script>

<script lang="ts">
  let sampleSet = $state<PrescribedSetDto>({
    setNumber: 1,
    type: "working",
    reps: 8,
    amrap: false,
    targetRpe: 8,
    restSeconds: 150,
    targetWeightKg: 80,
  });

  let rangeSet = $state<PrescribedSetDto>({
    setNumber: 2,
    type: "working",
    reps: 10,
    repsMin: 6,
    amrap: false,
    targetRpe: 8,
    restSeconds: 120,
    targetWeightKg: 75,
  });

  let amrapSet = $state<PrescribedSetDto>({
    setNumber: 3,
    type: "backoff",
    reps: 12,
    amrap: true,
    targetRpe: 9,
    restSeconds: 90,
  });

  let timedSet = $state<PrescribedSetDto>({
    setNumber: 4,
    type: "working",
    reps: 0,
    durationSeconds: 45,
    amrap: false,
    restSeconds: 60,
  });
</script>

<Story name="Standard Working Set" asChild>
  <SetRowEditor bind:set={sampleSet} onremove={() => alert("remove clicked")} />
</Story>

<Story name="Rep Range Set" asChild>
  <SetRowEditor bind:set={rangeSet} onremove={() => alert("remove clicked")} />
</Story>

<Story name="AMRAP Set" asChild>
  <SetRowEditor bind:set={amrapSet} onremove={() => alert("remove clicked")} />
</Story>

<Story name="Timed Set" asChild>
  <SetRowEditor bind:set={timedSet} onremove={() => alert("remove clicked")} />
</Story>
