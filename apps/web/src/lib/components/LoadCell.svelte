<script module lang="ts">
  export type LoadMode = "bw" | "kg";
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
   * sits in the same spot in both modes, so focus stays put and the cell keeps its
   * height. On a bodyweight move the kg reads "Added kg": a vest, a belt.
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
    onedit,
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
    onedit?: () => void;
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

<div class="lcell" class:bw>
  <div class="lc-head">
    <span class="lc-label" aria-hidden="true">{bw ? text.load : added ? text.added : text.unit}</span>
    <button type="button" class="lc-switch" aria-label={bw ? text.toLoad : text.toBw} {disabled} onclick={flip}>
      {bw ? text.addLoad : text.bw}
    </button>
  </div>
  {#if bw}
    <p class="lc-bw">{text.bodyweight}</p>
  {:else}
    <LogStepper bind:value id={inputId} {label} unit="" {step} {min} {max} {from} {error} {errorId} {disabled} {onedit} />
  {/if}
</div>

<style>
  .lcell { min-width: 0; }

  /* Taller than a plain cell's label, to hold the switch: the page bottom-aligns its cells. */
  .lc-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 6px;
    height: 28px;
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
    min-width: 44px;
    height: 28px;
    padding: 0 10px;
    font: 600 12px/1 var(--font-ui);
    color: var(--blue);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 999px;
    cursor: pointer;
    touch-action: manipulation;
    transition: background-color 120ms;
  }
  /* A 44px tall target: the extra reaches up into the gap over the cell, never down onto the stepper. */
  .lc-switch::before { content: ""; position: absolute; inset: -16px -2px 0; }
  .lc-switch:hover { background: var(--well); }
  .lc-switch:active { background: var(--active); }
  .lc-switch:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 999px; }
  .lc-switch:disabled { color: var(--faint); cursor: default; }

  /* Nothing to fill in: a flat tint, not a field. Matches the input's height. */
  .lc-bw {
    display: flex;
    align-items: center;
    margin: 0;
    height: 30px;
    padding: 0 8px;
    font: 600 13px/1.2 var(--font-ui);
    color: var(--ink);
    background: var(--well-2);
    border: 1px solid transparent;
    border-radius: 6px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* The log page's narrow sheet, as LogStepper: 44px rows. */
  @container logform (max-width: 679px) {
    .lc-bw { height: 44px; padding: 0 14px; font-size: 16px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .lc-switch { transition: none; }
  }
</style>
