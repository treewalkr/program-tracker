<script lang="ts">
  import type { Snippet } from "svelte";
  import { WEEK_DIRECTIVES, WEEK_METRICS, type ProgressionKind, type WeekMetric } from "@pt/shared";
  import type { PhasingRow } from "$lib/phasing";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";

  /**
   * Week-by-week scheme rows: directive, target (metric ±%), progression rule
   * vs the week before, and a note. Shared by the program's periodization
   * editor, the new-program custom scheme and the /schemes editor.
   */
  let {
    rows = $bindable(),
    min = 2,
    max = 26,
    newRow = () => ({ directive: "+volume", metric: "", deltaPercent: null }),
    actions,
  }: {
    rows: PhasingRow[];
    /** Fewest weeks (remove disables at this count). */
    min?: number;
    max?: number;
    /** The row "+ Add week" appends. */
    newRow?: () => PhasingRow;
    /** Extra buttons beside "+ Add week". */
    actions?: Snippet;
  } = $props();

  const METRIC_LABELS: Record<WeekMetric, string> = {
    overall_volume: "Overall vol",
    rep_volume: "Rep vol",
    intensity: "Intensity",
  };
  const PROG_LABELS: Record<ProgressionKind, string> = { kg: "+kg", percent: "+% 1RM", sets: "+sets" };
  const PROG_STEP: Record<ProgressionKind, number> = { kg: 2.5, percent: 2.5, sets: 1 };

  /** Rows whose note field is open while still empty. */
  let noteOpen = $state<Record<number, boolean>>({});
</script>

<div class="week-rows">
  {#each rows as r, i (i)}
    <div class="week-row">
      <div class="row-main">
        <span class="wk">W{i + 1}</span>
        <select class="select tiny" bind:value={r.directive} aria-label="Week {i + 1} directive">
          {#each WEEK_DIRECTIVES as opt (opt)}
            <option value={opt}>{opt}</option>
          {/each}
        </select>
        <select class="select tiny" bind:value={r.metric} aria-label="Week {i + 1} target">
          <option value="">No target</option>
          {#each WEEK_METRICS as m (m)}
            <option value={m}>{METRIC_LABELS[m]}</option>
          {/each}
        </select>
        {#if r.metric !== ""}
          <input
            class="input tiny-num"
            type="number"
            min="-100"
            max="200"
            placeholder="±%"
            aria-label="Week {i + 1} target change, percent"
            bind:value={r.deltaPercent}
          />
        {/if}
        {#if i > 0}
          <select
            class="select tiny"
            aria-label="Week {i + 1} progression vs week {i}"
            value={r.progKind ?? ""}
            onchange={(e) => {
              const k = e.currentTarget.value as ProgressionKind | "";
              r.progKind = k;
              if (k && !r.progAmount) r.progAmount = PROG_STEP[k];
            }}
          >
            <option value="">No progression</option>
            {#each Object.entries(PROG_LABELS) as [k, label] (k)}
              <option value={k}>{label}</option>
            {/each}
          </select>
          {#if r.progKind}
            <input
              class="input tiny-num"
              type="number"
              min="-50"
              max="50"
              step={PROG_STEP[r.progKind]}
              aria-label="Week {i + 1} progression amount"
              bind:value={r.progAmount}
            />
          {/if}
        {/if}
        <span class="row-end">
          {#if !r.note && !noteOpen[i]}
            <Button variant="ghost" small onclick={() => (noteOpen[i] = true)} aria-label="Add a note to week {i + 1}">Note</Button>
          {/if}
          <Button
            variant="ghost"
            small
            disabled={rows.length <= min}
            onclick={() => {
              rows = rows.filter((_, j) => j !== i);
              noteOpen = {};
            }}
            aria-label="Remove week {i + 1}"
          >{#snippet icon()}<Icon name="x" />{/snippet}</Button>
        </span>
      </div>
      {#if r.note || noteOpen[i]}
        <input
          class="input note"
          type="text"
          maxlength="500"
          placeholder="Note for week {i + 1}, e.g. RPE ≤ 7"
          aria-label="Week {i + 1} note"
          bind:value={r.note}
        />
      {/if}
    </div>
  {/each}

  <div class="add-row">
    <Button variant="ghost" small disabled={rows.length >= max} onclick={() => (rows = [...rows, newRow()])}>+ Add week</Button>
    {@render actions?.()}
  </div>
</div>

<style>
  .week-rows { display: flex; flex-direction: column; gap: 6px; }
  .week-row { display: flex; flex-direction: column; gap: 4px; }
  .row-main { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .row-end { margin-left: auto; display: inline-flex; gap: 2px; }
  .wk { font: 500 12px var(--font-mono); width: 26px; color: var(--muted); }
  .select.tiny { width: auto; padding: 3px 6px; font-size: 12.5px; }
  .tiny-num { width: 64px; padding: 3px 6px; text-align: right; font-family: var(--font-mono); font-size: 12.5px; }
  .note { margin-left: 32px; width: calc(100% - 32px); padding: 3px 8px; font-size: 12.5px; }
  .add-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 2px; }
</style>
