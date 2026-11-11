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
    exerciseUnits,
    formatPatternBalance,
    groupKind,
    groupTag,
    MOVEMENT_PATTERN_INFO,
    type MovementPattern,
    patternBalance,
    type SessionKind,
  } from "@pt/shared";
  import RoleChip from "$lib/components/RoleChip.svelte";
  import SetChips from "$lib/components/SetChips.svelte";
  import GroupTag from "$lib/components/GroupTag.svelte";
  import { groupSets } from "$lib/setChips";
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
      /** Superset letter shared by adjacent members. */
      group?: string | null;
    }[];
    /** Change marks keyed by exercise `slot` (chat draft preview). */
    marks?: Map<number, SlotMark>;
    /** Shows a quiet "Note" on each row and the session head; slot null = the whole session. */
    onnote?: (slot: number | null) => void;
    /** Slots (and 0 for the session) that already carry a note. */
    noted?: ReadonlySet<number>;
  }

  let { name, tag, when, kind = "lifting", cardio = null, exercises = [], marks, onnote, noted }: Props = $props();

  const units = $derived(exerciseUnits(exercises));

  const hasPattern = $derived(
    exercises.some((e) => !!e.movementPattern && e.movementPattern in MOVEMENT_PATTERN_INFO)
  );

  /** Columns the session's set chips line up into (load/tempo/rest only when some set has one). */
  const cols = $derived({
    load: exercises.some((e) => groupSets(e.sets, e.oneRepMaxKg ?? null).some((g) => g.kg || g.pct)),
    tempo: exercises.some((e) => e.sets.some((s) => !!s.tempo)),
    rest: exercises.some((e) => e.sets.some((s) => !!s.restSeconds)),
  });

  /** Notation key over the columns — only the effort forms this session uses. */
  const legend = $derived.by(() => {
    const rpes = exercises.flatMap((e) => groupSets(e.sets).map((g) => g.rpe ?? ""));
    const parts: string[] = [];
    if (rpes.some((r) => r.includes("→"))) parts.push("7→8 climbs set to set");
    if (rpes.some((r) => r.includes("–"))) parts.push("7–8 is a range");
    return parts.join(" · ");
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
      {#snippet exrow(e: (typeof exercises)[number], i: number, striped = false)}
        {@const m = e.slot != null ? marks?.get(e.slot) : undefined}
        <div class="exrow" class:stripe={striped} class:is-primary={e.role === "primary"} class:is-changed={!!m} class:is-unasked={m?.kind === "unproposed"} data-slot={e.slot}>
          <div class="ex">
            {#if e.group}<GroupTag tag={groupTag(exercises, i) ?? e.group} />{/if}
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
      {/snippet}
      <!-- rows stripe by exercise index; a superset is one framed, tinted block that pauses them -->
      {#each units as u (u.start)}
        {#if u.group}
          <div class="xgroup" role="group" aria-label="{groupKind(u.items.length)} {u.group}">
            <div class="grouphead">
              <span><span class="gletter">{u.group}</span><strong>{groupKind(u.items.length)}</strong></span>
              <span class="rounds">{u.items[0].sets.length} {u.items[0].sets.length === 1 ? "round" : "rounds"}</span>
            </div>
            {#each u.items as e, k (u.start + k)}{@render exrow(e, u.start + k)}{/each}
          </div>
        {:else}
          {@render exrow(u.items[0], u.start, u.start % 2 === 1)}
        {/if}
      {/each}
    </div>
    {#if hasPattern || legend}
      <!-- the notation key lives here, not over the columns: it must survive the stacked (≤660px) card -->
      <div class="balance">
        {#if hasPattern}<span>{formatPatternBalance(patternBalance(exercises))}</span>{/if}
        {#if legend}<span class="legend">RPE {legend}</span>{/if}
      </div>
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
    left: calc(var(--row-pad-l, 14px) - 13px);
    top: 8px;
    font: 700 13px/1.4 var(--font-mono);
    color: var(--blue);
  }
  .exrow.is-unasked::before {
    color: var(--warn);
  }
  .is-primary .ex-name {
    font-weight: 600;
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
  /* a superset/circuit: one Well-tinted block framed by strong hairlines,
     header band on top, members split by hairlines (no stripes inside).
     Rows stay on the card's columns. */
  .xgroup {
    display: flex;
    flex-direction: column;
    background: var(--well);
    border-top: 1px solid var(--line-strong);
    border-bottom: 1px solid var(--line-strong);
  }
  .xgroup + .xgroup {
    border-top: 0;
  }
  .xgroup:last-child {
    border-bottom: 0;
  }
  .xgroup > :global(.exrow + .exrow) {
    border-top: 1px solid var(--line);
  }
  /* A1/A2 lift off the tint so the order reads first */
  .xgroup :global(.gtag) {
    background: var(--surface);
    color: var(--ink);
    border-color: var(--line-strong);
  }
  .grouphead {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 14px 5px var(--row-pad-l, 14px);
    border-bottom: 1px solid var(--line);
    font: 500 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .grouphead strong { color: var(--ink); font-weight: 600; }
  .rounds { font: 500 11px/1.4 var(--font-mono); font-variant-numeric: tabular-nums; }
  .gletter { font: 600 11px/1 var(--font-mono); margin-right: 4px; }
  .balance {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 16px;
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
  .colhead { padding-top: 6px; padding-bottom: 0; }
  .legend { font: 400 11px/1.6 var(--font-mono); }
  /* stacked rows (app.css): a tag that wraps starts flush with the role chip;
     chips no longer form columns, so the labels go */
  @container session (max-width: 660px) {
    .mp-tag { margin-left: 0; }
    .colhead { display: none; }
  }
</style>
