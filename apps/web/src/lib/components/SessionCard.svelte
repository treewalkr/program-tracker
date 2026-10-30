<script lang="ts">
  import type { CardioPrescriptionDto, ExerciseRole, PrescribedSetDto } from "$lib/api/types";
  import {
    formatPatternBalance,
    MOVEMENT_PATTERN_INFO,
    type MovementPattern,
    patternBalance,
    type SessionKind,
  } from "@pt/shared";
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
    kind?: SessionKind;
    cardio?: CardioPrescriptionDto | null;
    exercises?: {
      name: string;
      role?: ExerciseRole;
      movementPattern?: string | null;
      sets: PrescribedSetDto[];
    }[];
  }

  let { name, when, kind = "lifting", cardio = null, exercises = [] }: Props = $props();

  const hasPattern = $derived(
    exercises.some((e) => !!e.movementPattern && e.movementPattern in MOVEMENT_PATTERN_INFO)
  );

  const cardioLine = $derived.by(() => {
    if (!cardio) return "";
    const parts = [
      cardio.modality,
      cardio.durationMin ? `${cardio.durationMin} min` : null,
      cardio.hrZone ? `Z${cardio.hrZone}` : null,
      cardio.intensity || null,
      cardio.distanceKm ? `${cardio.distanceKm} km` : null,
      cardio.targetRpe ? `RPE ${cardio.targetRpe}` : null,
    ].filter(Boolean);
    return parts.join(" · ");
  });
</script>

<div class="session">
  <div class="session-head">
    <h3>{name}</h3>
    {#if when}<span class="when">{when}</span>{/if}
  </div>
  {#if kind === "cardio" || (cardio && exercises.length === 0)}
    <div class="session-head cond-row">
      <span class="cond"><Icon name="pulse" />{cardioLine}</span>
    </div>
  {:else}
    <div class="session-body">
      {#each exercises as e, i (i)}
        <div class="exrow">
          <div class="ex">
            {#if e.role}<RoleChip role={e.role} />{/if}
            {e.name || "Unmapped exercise"}
            {#if e.movementPattern && e.movementPattern in MOVEMENT_PATTERN_INFO}
              {@const info = MOVEMENT_PATTERN_INFO[e.movementPattern as MovementPattern]}
              <span class="mp-tag" title={info.description}>{info.label}</span>
            {/if}
          </div>
          <SetChips sets={e.sets} />
        </div>
      {/each}
    </div>
    {#if hasPattern}
      <div class="balance">{formatPatternBalance(patternBalance(exercises))}</div>
    {/if}
    {#if cardio}
      <div class="session-head cond-row">
        <span class="cond"><Icon name="pulse" />{cardioLine}</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .mp-tag {
    display: inline-flex;
    align-items: center;
    font: 500 11px/1 var(--font-ui);
    padding: 1px 6px;
    border-radius: 99px;
    border: 1px solid var(--line);
    background: var(--well);
    color: var(--muted);
    white-space: nowrap;
    margin-left: 6px;
  }
  .balance {
    font-size: 12px;
    color: var(--muted);
    padding: 6px 16px 10px;
    border-top: 1px dashed var(--line);
  }
  .cond-row { border-bottom: none; padding-bottom: 13px; }
</style>
