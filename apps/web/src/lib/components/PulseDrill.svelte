<script lang="ts">
  import type { PulseCell, PulseCellSet } from "@pt/shared";
  import { drillHeading, drillLoad, drillType } from "$lib/pulseDrill";

  /**
   * The sets behind one Pulse cell — the evidence a coach checks before
   * trusting a number. Rows come from `pulseCellSets`, so they always add up
   * to the cell they were opened from.
   */
  interface Props {
    id: string;
    rows: PulseCellSet[];
    cell: PulseCell;
    week: number;
    nameOf: (exerciseId: string) => string;
    onclose: () => void;
  }

  let { id, rows, cell, week, nameOf, onclose }: Props = $props();

  const fmtKg = (kg: number) => `${Math.round(kg).toLocaleString("en-US")} kg`;
  const total = $derived(rows.reduce((t, r) => t + (r.weightKg ?? 0) * r.reps, 0));
</script>

<section class="drill" {id} aria-label={drillHeading(cell, week, rows.length)}>
  <header>
    <h3>{drillHeading(cell, week, rows.length)}</h3>
    {#if cell === "volume" && rows.length > 0}<span class="sum">Σ {fmtKg(total)}</span>{/if}
    <button type="button" class="close" onclick={onclose}>Close</button>
  </header>
  {#if rows.length === 0}
    <p class="empty">No sets behind this number.</p>
  {:else}
    <div class="wrap">
      <table class="sheet">
        <thead>
          <tr>
            <th>Date</th>
            <th>Exercise</th>
            <th class="r">Set</th>
            <th>Type</th>
            {#if cell === "volume"}<th class="r">Volume</th>{/if}
            {#if cell === "e1rm"}<th class="r">e1RM</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each rows as r, i (i)}
            <tr class:top={cell === "e1rm" && i === 0}>
              <td class="date">{r.date}</td>
              <td>{nameOf(r.exerciseId)}{#if r.timed}<span class="tag">hold</span>{/if}</td>
              <td class="r">{drillLoad(r)}</td>
              <td class:backoff={r.type === "backoff"}>{drillType(r.type)}</td>
              {#if cell === "volume"}<td class="r">{fmtKg((r.weightKg ?? 0) * r.reps)}</td>{/if}
              {#if cell === "e1rm"}<td class="r">{r.e1rm != null ? `${Math.round(r.e1rm)} kg` : "—"}</td>{/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .drill { border-top: 1px solid var(--line-soft); background: var(--well); }
  header { display: flex; align-items: baseline; gap: 12px; padding: 10px 16px 6px; }
  h3 { margin: 0; font: 600 12.5px/1.3 var(--font-ui); color: var(--ink); }
  .sum { font: 500 12px/1 var(--font-mono); color: var(--muted); font-variant-numeric: tabular-nums; }
  .close {
    margin-left: auto;
    font: 500 12px/1 var(--font-ui);
    color: var(--muted);
    background: none;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 5px 9px;
    cursor: pointer;
  }
  .close:hover { color: var(--ink); }
  .close:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
  .wrap { overflow-x: auto; padding: 0 6px 8px; }
  .empty { margin: 0; padding: 4px 16px 12px; font-size: 13px; color: var(--muted); }
  .date { font: 400 12px/1.4 var(--font-mono); color: var(--muted); white-space: nowrap; }
  .tag {
    margin-left: 6px;
    font: 500 10.5px/1 var(--font-ui);
    color: var(--faint);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .backoff { color: var(--muted); }
  tr.top td { font-weight: 600; }
</style>
