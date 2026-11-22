<script module lang="ts">
  import type { LoadMode } from "$lib/loadMode";
  export type { LoadMode };
  export interface LoadCellText {
    /** The kg-mode label: "kg" (or "lb"). */
    unit: string;
    /** The kg-mode label on a bodyweight move, where the kg is on top of the body: "Added kg". */
    added: string;
    /** The BW-mode label over the Bodyweight box: "Load". */
    load: string;
    /** What the BW box reads: "Bodyweight". */
    bodyweight: string;
    /** The kg-mode switch: "BW". */
    bw: string;
    /** The BW-mode switch: "+ kg". */
    addLoad: string;
    /** Accessible name of the switch to BW, naming the set: "Step-up set 2: bodyweight". */
    toBw: string;
    /** Accessible name of the switch to kg: "Step-up set 2: add weight". */
    toLoad: string;
  }
</script>

<script lang="ts">
  import { tick } from "svelte";
  import LogStepper from "./LogStepper.svelte";
  import type { Cell } from "$lib/logSheet";

  /**
   * One set's load: the external weight held or added. BW means none — a quiet
   * Bodyweight box, no number to fill in; kg is the log sheet's stepper. The switch
   * is a text link on the label's line, in the same spot in both modes, so focus
   * stays put and the cell is as tall as a plain one. On a bodyweight move the kg
   * reads "Added kg": a vest, a belt.
   *
   * `compact`: the trainer's desk table, where a column head already says kg —
   * one 28px line, the switch a chip left of the number, no label. In the narrow sheet
   * (the `logform` container under 680px) it reads like the member's cell.
   */
  let {
    value = $bindable(),
    mode,
    onmode,
    added = false,
    id,
    label,
    text,
    step,
    min,
    max,
    from = null,
    error,
    errorId,
    disabled = false,
    compact = false,
    placeholder,
    copied = false,
    enterkeyhint,
    onedit,
    oncommit,
  }: {
    value: Cell;
    mode: LoadMode;
    onmode: (mode: LoadMode) => void;
    /** A bodyweight move: kg is added load. */
    added?: boolean;
    /** The kg input's id, so a page can scroll to and focus it. */
    id?: string;
    /** Accessible name of the kg input: "Step-up Set 2, kg". */
    label: string;
    text: LoadCellText;
    step: number;
    min: number;
    max: number;
    from?: number | null;
    error?: string;
    errorId?: string;
    disabled?: boolean;
    /** One line for a dense table (the trainer's sheet at desk width). */
    compact?: boolean;
    /** The kg input's ghost: what "as prescribed" would log. */
    placeholder?: string;
    /** The kg was filled down from an earlier set. */
    copied?: boolean;
    enterkeyhint?: "next" | "done";
    onedit?: () => void;
    /** The kg is committed: the field's change, or a stepper tap. */
    oncommit?: () => void;
  } = $props();

  const uid = $props.id();
  const inputId = $derived(id ?? `load-${uid}`);
  const bw = $derived(mode === "bw");

  async function flip() {
    const next: LoadMode = bw ? "kg" : "bw";
    onmode(next);
    // to kg: straight into the number; to BW: the switch stays focused for a tap back
    if (next === "kg") {
      await tick();
      document.getElementById(inputId)?.focus();
    }
  }
</script>

<div class="lcell" class:bw class:compact>
  <div class="lc-head">
    <span class="lc-label" aria-hidden="true">{bw ? text.load : added ? text.added : text.unit}</span>
    <button type="button" class="lc-switch" aria-label={bw ? text.toLoad : text.toBw} {disabled} onclick={flip}>
      {bw ? text.addLoad : text.bw}
    </button>
  </div>
  {#if bw}
    <p class="lc-bw">{text.bodyweight}</p>
  {:else}
    <LogStepper bind:value id={inputId} {label} unit="" {step} {min} {max} {from} {placeholder} {copied} {enterkeyhint} {error} {errorId} {disabled} {onedit} {oncommit} />
  {/if}
</div>

<style>
  .lcell { min-width: 0; }

  /* The same height as a plain cell's label: the switch is a text link on the label's
     baseline, so a load cell and the reps cell beside it start their fields level. */
  .lc-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }
  .lc-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 500 12px/1.2 var(--font-ui);
    color: var(--muted);
  }

  .lc-switch {
    position: relative;
    flex: none;
    padding: 0;
    font: 600 12px/1.2 var(--font-ui);
    color: var(--blue);
    background: none;
    border: 0;
    border-radius: 4px;
    cursor: pointer;
    touch-action: manipulation;
  }
  /* A 44px target: the extra reaches up into the gap over the cell and a little to the
     side, never down onto the stepper's buttons. */
  .lc-switch::before {
    content: "";
    position: absolute;
    top: -30px;
    bottom: -2px;
    right: -6px;
    width: max(calc(100% + 12px), 48px);
  }
  .lc-switch:hover { text-decoration: underline; text-underline-offset: 2px; }
  .lc-switch:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .lc-switch:disabled { color: var(--faint); cursor: default; text-decoration: none; }

  /* Nothing to fill in: a flat tint, not a field — the state reads quieter than the numbers.
     Matches the input's height; centred where the stepper's number sits. */
  .lc-bw {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    height: 28px;
    padding: 0 8px;
    font: 500 13px/1.2 var(--font-ui);
    color: var(--muted);
    background: var(--well);
    border: 1px solid transparent;
    border-radius: 6px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* The desk table: one line, switch then number; the column head is the label.
     Both boxes are the input's 28px, so the row's fields share top and bottom. */
  @container logform (min-width: 680px) {
    .compact { display: flex; align-items: flex-start; gap: 4px; }
    .compact .lc-head { display: block; flex: none; margin: 0; }
    .compact .lc-label { display: none; }
    .compact .lc-switch {
      min-width: 40px;
      height: 28px;
      padding: 0 7px;
      font-size: 11px;
      line-height: 1;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 6px;
      transition: background-color 120ms;
    }
    .compact .lc-switch::before { inset: 0; width: auto; }
    .compact .lc-switch:hover { text-decoration: none; background: var(--well); }
    .compact .lc-switch:active { background: var(--active); }
    .compact > :global(:last-child) { flex: 1; min-width: 0; }
    .compact .lc-bw { justify-content: flex-end; height: 28px; padding: 0 8px; font-size: 12px; }
  }

  /* The log page's narrow sheet, as LogStepper: 44px rows. */
  @container logform (max-width: 679px) {
    .lc-bw { height: 44px; padding: 0 14px; font-size: 16px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .lc-switch { transition: none; }
  }
</style>
