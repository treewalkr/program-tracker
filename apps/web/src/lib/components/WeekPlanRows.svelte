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
   *
   * Laid out as a sheet: on a wide container every week is one line under a
   * column header; on a narrow one each week stacks push / target / rule
   * under its number, labelled in place.
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
    /** The row "Add week" appends. */
    newRow?: () => PhasingRow;
    /** Extra buttons beside "Add week". */
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
    { value: "", label: "No rule" },
    ...(Object.keys(PROG_LABELS) as ProgressionKind[]).map((k) => ({ value: k, label: PROG_LABELS[k] })),
  ];
  const figText = (n: number | null | undefined) => (n == null ? "" : String(n));

  /** The directive's ink, shared with DirChip and the scheme silhouette. */
  const TONE: Record<string, string> = { "+volume": "vol", "+intensity": "int", deload: "dl", transition: "dl", test: "test" };

  /** Rows whose note field is open while still empty. */
  let noteOpen = $state<Record<number, boolean>>({});
</script>

<div class="wp">
  <div class="sheet">
    <div class="hd" aria-hidden="true">
      <span>Week</span>
      <span>Push</span>
      <span>Target vs week before</span>
      <span>Rule vs week before</span>
    </div>

    {#each rows as r, i (i)}
      <div class="wrow" class:first={i === 0} role="group" aria-label="Week {i + 1}">
        <span class="wk {TONE[r.directive] ?? ''}">W{i + 1}</span>

        <span class="push"><SelectCell label="Week {i + 1} directive" options={DIRECTIVES} bind:value={r.directive} /></span>

        <span class="tgt">
          <span class="lbl" aria-hidden="true">Target</span>
          <span class="c"><SelectCell label="Week {i + 1} target" options={METRICS} bind:value={r.metric} /></span>
          {#if r.metric !== ""}
            <span class="c fig"><InputCell
              figure
              width={5}
              step={1}
              min={-100}
              signed
              max={200}
              placeholder="±%"
              label="Week {i + 1} target change, percent"
              value={figText(r.deltaPercent)}
              oncommit={(v) => (r.deltaPercent = parseFigure(v))}
            /></span><span class="unit">%</span>
          {/if}
        </span>

        {#if i > 0}
          <span class="rule">
            <span class="lbl" aria-hidden="true">Rule</span>
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
              <span class="c fig"><InputCell
                figure
                width={5}
                step={PROG_STEP[r.progKind]}
                min={-50}
                signed
                max={50}
                label="Week {i + 1} progression amount"
                value={figText(r.progAmount)}
                oncommit={(v) => (r.progAmount = parseFigure(v))}
              /></span>
            {/if}
          </span>
        {:else}
          <span class="rule start" title="The first week has no week before it">starts here</span>
        {/if}

        <span class="acts">
          {#if !r.note && !noteOpen[i]}
            <Button variant="ghost" small onclick={() => (noteOpen[i] = true)} aria-label="Add a note to week {i + 1}">{#snippet icon()}<Icon name="comment" />{/snippet}</Button>
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

        {#if r.note || noteOpen[i]}
          <span class="note">
            <InputCell maxlength={500} placeholder="Note for week {i + 1}, e.g. RPE ≤ 7" label="Week {i + 1} note" bind:value={() => r.note ?? "", (v) => (r.note = v)} />
          </span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="add-row">
    <Button small disabled={rows.length >= max} onclick={() => (rows = [...rows, newRow()])}>{#snippet icon()}<Icon name="plus" />{/snippet}Add week</Button>
    {@render actions?.()}
  </div>
</div>

<style>
  .wp { container-type: inline-size; display: flex; flex-direction: column; gap: 10px; }

  /* The weeks sit on a white sheet so they read as one table, even on a well. */
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
  }

  /* —— narrow: each week stacks under its number ——————————— */
  .hd { display: none; }
  .wrow {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    grid-template-areas:
      "wk   push acts"
      ".    tgt  tgt"
      ".    rule rule"
      ".    note note";
    align-items: center;
    column-gap: 8px;
    padding: 6px 10px 8px 12px;
    border-top: 1px solid var(--line-soft);
  }
  .wrow.first { border-top: none; }
  .wrow.first .rule.start { display: none; }

  .wk {
    grid-area: wk;
    font: 600 12px/1 var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  /* The week number takes its directive's ink, so a scan down the column reads the block's shape. */
  .wk.vol { color: var(--good); }
  .wk.int { color: var(--warn); }
  .wk.dl { color: var(--blue); }
  .wk.test { color: var(--ink); }

  .push { grid-area: push; display: flex; min-width: 0; padding-left: 6px; }
  .tgt { grid-area: tgt; }
  .rule { grid-area: rule; }
  .tgt, .rule { display: flex; align-items: center; gap: 0 4px; min-width: 0; }
  .acts { grid-area: acts; display: inline-flex; gap: 2px; }
  .note { grid-area: note; display: block; padding: 2px 6px 0; }

  .lbl { width: 52px; flex: none; font-size: 12px; color: var(--muted); }
  /* the quiet cells pull 6px into their gutter; give it back so neighbours don't touch */
  .c { display: inline-flex; padding: 0 6px; }
  .c.fig { padding-right: 0; }
  .unit { font: 400 12px var(--font-mono); color: var(--muted); }
  .start { font-size: 12px; color: var(--faint); }

  /* —— wide: one line per week under a header ———————————— */
  @container (min-width: 640px) {
    .hd,
    .wrow {
      display: grid;
      grid-template-columns: 44px 132px minmax(0, 240px) minmax(0, 240px) minmax(72px, 1fr);
      column-gap: 12px;
      padding-inline: 12px 8px;
    }
    .hd {
      padding-block: 7px;
      background: var(--well);
      border-bottom: 1px solid var(--line-soft);
      border-radius: 6px 6px 0 0;
      font: 600 11px/1.2 var(--font-ui);
      color: var(--muted);
    }
    /* line the labels up with the text inside the quiet cells */
    .hd span + span { padding-left: 6px; }
    .wrow {
      grid-template-areas:
        "wk push tgt  rule acts"
        ".  note note note note";
      padding-block: 4px;
    }
    .wrow.first .rule.start { display: block; padding-left: 6px; }
    .lbl { display: none; }
    .push { padding-left: 6px; }
    .acts { justify-content: flex-end; }
    .note { padding: 0 6px 4px; }
  }

  .add-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
</style>
