<script lang="ts">
  import { EXERCISE_ROLE_INFO } from "@pt/shared";
  import type { ExerciseRole } from "@pt/shared";

  /**
   * Session-slot chip for an exercise (Power / Primary / Str / Aux / Core).
   * Neutral well pill; the primary lift reads in default ink so the work a
   * session is built around stands out without colour. The full description
   * rides on `title`.
   */
  let { role }: { role: ExerciseRole } = $props();

  const info = $derived(EXERCISE_ROLE_INFO[role]);
</script>

<span class="role" class:primary={role === "primary"} title={info.description}>{info.label}</span>
