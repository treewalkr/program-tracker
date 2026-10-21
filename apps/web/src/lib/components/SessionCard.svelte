<script lang="ts">
  import type { ExerciseRole, PrescribedSetDto } from "$lib/api/types";
  import RoleChip from "$lib/components/RoleChip.svelte";
  import SetChips from "$lib/components/SetChips.svelte";
  import Icon from "$lib/ui/Icon.svelte";

  /**
   * One prescribed session over the global `.session` row classes (client
   * detail program tab, AI draft review). Callers resolve exercise names
   * into plain strings — empty names fall back to "Unmapped exercise".
   * A role chip leads the name when the exercise has one.
   */
  interface Props {
    name: string;
    /** Day pill next to the name ("Thursday · due today"). */
    when?: string;
    /** Cardio / conditioning footer row. */
    conditioning?: { label: string; detail?: string | null } | null;
    exercises: { name: string; role?: ExerciseRole; sets: PrescribedSetDto[] }[];
  }

  let { name, when, conditioning, exercises }: Props = $props();
</script>

<div class="session">
  <div class="session-head">
    <h3>{name}</h3>
    {#if when}<span class="when">{when}</span>{/if}
  </div>
  <div class="session-body">
    {#each exercises as e, i (i)}
      <div class="exrow">
        <div class="ex">
          {#if e.role}<RoleChip role={e.role} />{/if}
          {e.name || "Unmapped exercise"}
        </div>
        <SetChips sets={e.sets} />
      </div>
    {/each}
  </div>
  {#if conditioning}
    <div class="session-head cond-row">
      <span class="cond"><Icon name="pulse" />{conditioning.label}{#if conditioning.detail} · {conditioning.detail}{/if}</span>
    </div>
  {/if}
</div>

<style>
  .cond-row { border-bottom: none; padding-bottom: 13px; }
</style>
