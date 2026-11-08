<script lang="ts">
  import type { ExerciseRole } from "@pt/shared";
  import { roleDisplay } from "$lib/roleLabels";
  import { roleLabels } from "$lib/roleLabelStore.svelte";

  /**
   * Role chip for an exercise (Power / Primary / Secondary / Str / Aux / Core,
   * or one of the trainer's own labels) in the trainer's shorthand. Neutral
   * well pill; the primary lift reads in default ink so the work a session is
   * built around stands out without colour. The meaning rides on `title`.
   */
  let { role }: { role: ExerciseRole } = $props();

  const info = $derived(roleDisplay(role, roleLabels.all));
</script>

<span class="role" class:primary={role === "primary"} title="{info.name} — {info.description}">{info.chip}</span>
