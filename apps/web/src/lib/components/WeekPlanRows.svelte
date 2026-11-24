<script lang="ts">
  import type { Snippet } from "svelte";
  import { WEEK_DIRECTIVES, WEEK_METRICS, type ProgressionKind, type WeekDirective, type WeekMetric } from "@pt/shared";
  import type { PhasingRow } from "$lib/phasing";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import InputCell from "$lib/ui/InputCell.svelte";
  import SelectCell from "$lib/ui/SelectCell.svelte";
  import type { SelectOption } from "$lib/ui/select/options";
  import { parseFigure } from "$lib/ui/input/figure";

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

  const DIRECTIVES: SelectOption<WeekDirective>[] = WEEK_DIRECTIVES.map((d) => ({ value: d, label: d }));
  const METRICS: SelectOption<WeekMetric | "">[] = [{ value: "", label: "No target" }, ...WEEK_METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m] }))];
  const PROGS: SelectOption<ProgressionKind | "">[] = [
    { value: "", label: "No progression" },
    ...(Object.keys(PROG_LABELS) as ProgressionKind[]).map((k) => ({ value: k, label: PROG_LABELS[k] })),
  ];
  const figText = (n: number | null | undefined) => (n == null ? "" : String(n));

  /** Rows whose note field is open while still empty. */
  let noteOpen = $state<Record<number, boolean>>({});
</script>

<div class="week-rows">
  {#each rows as r, i (i)}
    <div class="week-row">
      <div class="row-main">
        <span class="wk">W{i + 1}</span>
        <span class="c"><SelectCell label="Week {i + 1} directive" options={DIRECTIVES} bind:value={r.directive} /></span>
        <span class="c"><SelectCell label="Week {i + 1} target" options={METRICS} bind:value={r.metric} /></span>
        {#if r.metric !== ""}
          <span class="c"><InputCell
            figure
            width={5}
            step={1}
            min={-100}
            max={200}
            placeholder="±%"
            label="Week {i + 1} target change, percent"
            value={figText(r.deltaPercent)}
            oncommit={(v) => (r.deltaPercent = parseFigure(v))}
          /></span>
        {/if}
        {#if i > 0}
          <span class="c"><SelectCell
            label="Week {i + 1} progression vs week {i}"
            options={PROGS}
            value={r.progKind ?? ""}
            onchange={(k) => {
              r.progKind = k;
              if (k && !r.progAmount) r.progAmount = PROG_STEP[k];
            }}
          /></span>
          {#if r.progKind}
            <span class="c"><InputCell
              figure
              width={5}
              step={PROG_STEP[r.progKind]}
              min={-50}
              max={50}
              label="Week {i + 1} progression amount"
              value={figText(r.progAmount)}
              oncommit={(v) => (r.progAmount = parseFigure(v))}
            /></span>
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
        <div class="note">
          <InputCell maxlength={500} placeholder="Note for week {i + 1}, e.g. RPE ≤ 7" label="Week {i + 1} note" bind:value={() => r.note ?? "", (v) => (r.note = v)} />
        </div>
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
  /* the quiet cells pull 6px into their gutter; give it back so neighbours don't touch */
  .c { display: inline-flex; padding: 0 6px; }
  .note { margin-left: 38px; margin-right: 6px; }
  .add-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 2px; }
</style>
