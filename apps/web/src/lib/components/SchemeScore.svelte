<script lang="ts">
  import { progressionLabel } from "@pt/shared";
  import type { WeekPlan } from "$lib/api/types";
  import DirChip from "./DirChip.svelte";

  /**
   * A scheme read week by week: what the week pushes, its volume and intensity
   * targets (% vs the week before), the progression rule that writes it, and
   * the week's note on a line of its own.
   */
  interface Props {
    weeks: WeekPlan[];
    /** The scheme's name, for the table caption. */
    name: string;
  }

  let { weeks, name }: Props = $props();

  const pct = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}%`;
</script>

<div class="wrap">
  <table class="sheet score">
    <caption class="sr-only">{name}, week by week</caption>
    <thead>
      <tr>
        <th scope="col">Week</th>
        <th scope="col">Push</th>
        <th scope="col" class="r" title="Volume target vs the week before">Volume</th>
        <th scope="col" class="r" title="Intensity target vs the week before">Intensity</th>
        <th scope="col" title="The rule that writes this week from the one before">Rule</th>
      </tr>
    </thead>
    <tbody>
      {#each weeks as w (w.week)}
        {@const vol = w.target && w.target.metric !== "intensity" ? w.target : null}
        {@const int = w.target?.metric === "intensity" ? w.target : null}
        <tr class:noted={!!w.note}>
          <th scope="row" class="wk">W{w.week}</th>
          <td><DirChip directive={w.directive}>{w.directive}</DirChip></td>
          <td class="r">
            {#if vol}{pct(vol.deltaPercent)}{#if vol.metric === "rep_volume"}<span class="unit"> reps</span>{/if}{/if}
          </td>
          <td class="r">{#if int}{pct(int.deltaPercent)}{/if}</td>
          <td>{#if w.progression}<code class="rule">{progressionLabel(w.progression)}</code>{/if}</td>
        </tr>
        {#if w.note}
          <tr class="wk-note">
            <td></td>
            <td colspan="4">{w.note}</td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>

<style>
  .wrap {
    overflow-x: auto;
    border: 1px solid var(--line-soft);
    border-radius: 6px;
  }
  .score {
    font-size: 13px;
  }
  .score th,
  .score td {
    padding: 6px 10px;
    vertical-align: middle;
  }
  .score thead th {
    background: var(--well);
    border-bottom-width: 1px;
    font-size: 11px;
    padding-block: 6px;
  }
  .score tbody tr:hover td {
    background: none;
  }
  .wk {
    font: 600 12px/1 var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    width: 1%;
    border-bottom: 1px solid var(--line-soft);
  }
  .score tbody tr:last-child .wk {
    border-bottom: none;
  }
  .r {
    width: 1%;
  }
  td.r {
    color: var(--ink);
  }
  .unit {
    font-family: var(--font-ui);
    color: var(--muted);
  }
  .rule {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--chip-bg);
    color: var(--ink);
    white-space: nowrap;
  }
  /* A week's note reads as part of its week: no rule between them. */
  tr.noted td,
  tr.noted .wk {
    border-bottom: none;
  }
  tr.noted + tr.wk-note td {
    padding-top: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--muted);
  }
  @media (max-width: 480px) {
    .score th,
    .score td {
      padding-inline: 7px;
    }
  }
</style>
