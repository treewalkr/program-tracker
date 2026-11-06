<script lang="ts">
  import type { ProgramPhasingDto } from "$lib/api/types";
  import { planIndexes, weekTargetLabel } from "$lib/draftReview";

  /**
   * The block's weeks as a row of tiles: directive, % target, and a bar for the
   * volume index chained from the targets (week 1 = 100). Tiles are buttons —
   * picking one shows its note. `changed` outlines weeks edited since the
   * previous version.
   */
  interface Props {
    phasing: ProgramPhasingDto;
    selected?: number;
    changed?: ReadonlySet<number>;
  }

  let { phasing, selected = $bindable(1), changed = new Set() }: Props = $props();

  const weeks = $derived(phasing.weeks ?? []);
  const idx = $derived(planIndexes(phasing));
  const maxVol = $derived(Math.max(1, ...idx.map((x) => x.vol)));
  const cls = (d: string) => (d === "+volume" ? "vol" : d === "+intensity" ? "int" : d === "deload" || d === "transition" ? "tr" : "");
  const current = $derived(weeks.find((w) => w.week === selected) ?? weeks[0]);
</script>

<div class="weeks" style:--n={weeks.length}>
  {#each weeks as w, i (w.week)}
    <button
      type="button"
      class="wk"
      class:changed={changed.has(w.week)}
      aria-pressed={selected === w.week}
      title={w.note ?? ""}
      onclick={() => (selected = w.week)}
    >
      <span class="n">W{w.week}{#if changed.has(w.week)}<span class="edited"> · edited</span>{/if}</span>
      <span class="d {cls(w.directive)}">{w.directive}</span>
      <span class="t">{weekTargetLabel(w)}</span>
      <span class="bar"><i class:deload={w.directive === "deload"} style:width="{Math.round((idx[i].vol / maxVol) * 100)}%"></i></span>
      <span class="idx">vol {Math.round(idx[i].vol)} · load {+idx[i].load.toFixed(1)}</span>
    </button>
  {/each}
</div>
{#if current}
  <p class="wk-note"><span class="nn">W{current.week}</span><span>{current.note || "No note for this week."}</span></p>
{/if}

<style>
  .weeks {
    display: grid;
    grid-template-columns: repeat(var(--n, 6), minmax(0, 1fr));
    gap: 4px;
  }
  .wk {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 7px 8px 8px;
    background: var(--surface);
    text-align: left;
    font: inherit;
    color: inherit;
    min-width: 0;
    cursor: pointer;
  }
  .wk:hover {
    border-color: var(--line-strong);
  }
  .wk[aria-pressed="true"] {
    border-color: var(--hover-ink);
    box-shadow: inset 0 0 0 1px var(--hover-ink);
  }
  .wk.changed {
    border-color: var(--blue);
  }
  .n {
    font: 600 11px/1 var(--font-mono);
    color: var(--muted);
    display: block;
  }
  .edited {
    color: var(--blue);
    font-family: var(--font-ui);
    font-weight: 500;
  }
  .d {
    font: 600 12px/1.2 var(--font-ui);
    display: block;
    margin-top: 5px;
  }
  .d.vol {
    color: var(--good);
  }
  .d.int {
    color: var(--warn);
  }
  .d.tr {
    color: var(--blue);
  }
  .t {
    font: 500 11px/1.2 var(--font-mono);
    color: var(--muted);
    display: block;
    margin-top: 3px;
    min-height: 13px;
  }
  .bar {
    display: block;
    height: 4px;
    border-radius: 99px;
    margin-top: 7px;
    background: var(--well-2);
  }
  .bar i {
    display: block;
    height: 100%;
    border-radius: 99px;
    background: var(--done-3);
  }
  .bar i.deload {
    background: var(--blue);
  }
  .idx {
    font: 500 11px/1.2 var(--font-mono);
    color: var(--muted);
    display: block;
    margin-top: 6px;
    font-variant-numeric: tabular-nums;
  }
  .wk-note {
    margin: 10px 2px 0;
    font-size: 13px;
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  .nn {
    font: 600 12px/1 var(--font-mono);
    color: var(--muted);
  }
  @media (max-width: 1000px) {
    .weeks {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
