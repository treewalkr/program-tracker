<script module lang="ts">
  export interface SlotMark {
    kind: "changed" | "unproposed";
    /** Old value shown as "was …" (old name for swaps, old prescription parts for rx). */
    was: string | null;
  }
</script>

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
    /** Track eyebrow ("Session 2" / "Cardio 1"), shown ahead of the name. */
    tag?: string;
    /** Day pill next to the name ("Thursday · due today"). */
    when?: string;
    kind?: SessionKind;
    cardio?: CardioPrescriptionDto | null;
    exercises?: {
      name: string;
      role?: ExerciseRole;
      movementPattern?: string | null;
      sets: PrescribedSetDto[];
      /** The client's 1RM for this exercise — %1RM sets show their kg. */
      oneRepMaxKg?: number | null;
      /** 1-based raw draft index; keys `marks`. */
      slot?: number;
    }[];
    /** Change marks keyed by exercise `slot` (chat draft preview). */
    marks?: Map<number, SlotMark>;
    /** Shows a quiet "Note" on each row and the session head; slot null = the whole session. */
    onnote?: (slot: number | null) => void;
    /** Slots (and 0 for the session) that already carry a note. */
    noted?: ReadonlySet<number>;
  }

  let { name, tag, when, kind = "lifting", cardio = null, exercises = [], marks, onnote, noted }: Props = $props();

  const hasPattern = $derived(
    exercises.some((e) => !!e.movementPattern && e.movementPattern in MOVEMENT_PATTERN_INFO)
  );

  /** Columns the session's set chips line up into (tempo/rest only when some set has one). */
  const cols = $derived({
    tempo: exercises.some((e) => e.sets.some((s) => !!s.tempo)),
    rest: exercises.some((e) => e.sets.some((s) => !!s.restSeconds)),
  });

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
    {#if tag}<span class="track">{tag}</span>{/if}
    <h3>{name}</h3>
    {#if when}<span class="when">{when}</span>{/if}
    {#if onnote}
      <button type="button" class="note-btn head-note" class:noted={noted?.has(0)} aria-label="Note on {name}" title="Note on this session" onclick={() => onnote(null)}>
        <Icon name="comment" /><span>Note</span>
      </button>
    {/if}
  </div>
  {#if kind === "cardio" || (cardio && exercises.length === 0)}
    <div class="session-head cond-row">
      <span class="cond"><Icon name="pulse" />{cardioLine}</span>
    </div>
  {:else}
    <div class="session-body">
      {#if exercises.length > 1}
        <div class="exrow colhead" aria-hidden="true"><span></span><SetChips sets={[]} {cols} head /></div>
      {/if}
      {#each exercises as e, i (i)}
        {@const m = e.slot != null ? marks?.get(e.slot) : undefined}
        <div class="exrow" class:is-changed={!!m} class:is-unasked={m?.kind === "unproposed"} data-slot={e.slot}>
          <div class="ex">
            {#if e.role}<RoleChip role={e.role} />{/if}
            <span class="ex-name">{e.name || "Unmapped exercise"}{#if m?.was}<span class="was">was {m.was}{#if m.kind === "unproposed"}{" · not in proposal"}{/if}</span>{/if}</span>
            {#if e.movementPattern && e.movementPattern in MOVEMENT_PATTERN_INFO}
              {@const info = MOVEMENT_PATTERN_INFO[e.movementPattern as MovementPattern]}
              <span class="mp-tag" title={info.description}>{info.label}</span>
            {/if}
            {#if onnote && e.slot != null}
              {@const slot = e.slot}
              <button type="button" class="note-btn" class:noted={noted?.has(slot)} aria-label="Note on {e.name || 'this exercise'}" title="Note on this exercise" onclick={() => onnote(slot)}>
                <Icon name="comment" /><span>Note</span>
              </button>
            {/if}
          </div>
          <SetChips sets={e.sets} oneRepMaxKg={e.oneRepMaxKg} {cols} />
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
  .exrow {
    position: relative;
  }
  .exrow.is-changed::before {
    content: "~";
    position: absolute;
    left: -13px;
    top: 1px;
    font: 700 13px/1.4 var(--font-mono);
    color: var(--blue);
  }
  .exrow.is-unasked::before {
    color: var(--warn);
  }
  .ex-name {
    min-width: 0;
    overflow-wrap: break-word;
  }
  .was {
    display: block;
    font: 400 12px/1.4 var(--font-ui);
    color: var(--muted);
    margin-top: 2px;
  }
  .is-unasked .was {
    color: var(--warn);
  }
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
  .track {
    font: 500 11px/1 var(--font-mono);
    color: var(--muted);
    white-space: nowrap;
  }
  .cond-row { border-bottom: none; padding-bottom: 13px; }

  /* Quiet until the row is hovered or focused; always there on touch, and once a note exists. */
  .note-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    border: 1px solid transparent;
    border-radius: 99px;
    background: none;
    font: 500 11px/1.4 var(--font-ui);
    color: var(--faint);
    cursor: pointer;
    opacity: 0;
    transition: opacity 120ms, background-color 120ms;
  }
  .note-btn :global(svg) { width: 12px; height: 12px; }
  .head-note { margin-left: auto; }
  .exrow:hover .note-btn,
  .exrow:focus-within .note-btn,
  .session-head:hover .note-btn,
  .note-btn:focus-visible { opacity: 1; }
  .note-btn:hover { background: var(--well-2); color: var(--ink); }
  .note-btn.noted { opacity: 1; color: var(--blue); }
  .note-btn.noted span { display: none; }
  @media (hover: none) { .note-btn { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .note-btn { transition: none; } }
  /* column labels over the aligned set chips; tight to the first row */
  .colhead { margin: -4px 0 -6px; }
  /* stacked rows (app.css): a tag that wraps starts flush with the role chip;
     chips no longer form columns, so the labels go */
  @container session (max-width: 520px) {
    .mp-tag { margin-left: 0; }
    .colhead { display: none; }
  }
</style>
