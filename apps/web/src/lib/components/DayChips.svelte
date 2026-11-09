<script lang="ts">
  import { DAY_SHORT } from "$lib/clientProfile";

  /**
   * One row of Mon–Sun toggle chips bound to a sorted list of ISO weekdays
   * (1=Mon … 7=Sun). Picked chips fill Inverted Ink. `empty` is the muted line
   * shown while nothing is picked (what an empty list means for this field).
   */
  let {
    days = $bindable(),
    label,
    idPrefix,
    empty,
  }: { days: number[]; label: string; idPrefix: string; empty?: string } = $props();

  const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const DAYS = [1, 2, 3, 4, 5, 6, 7];

  const toggled = (list: number[], d: number) =>
    list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort((a, b) => a - b);
</script>

<div class="dchips-field">
  <span class="label" id="{idPrefix}-label">{label}</span>
  <div class="dchips" role="group" aria-labelledby="{idPrefix}-label" aria-describedby={empty && !days.length ? `${idPrefix}-empty` : undefined}>
    {#each DAYS as d (d)}
      {@const on = days.includes(d)}
      <button type="button" class="dchip" class:on aria-pressed={on} aria-label={DAY_FULL[d - 1]} onclick={() => (days = toggled(days, d))}>
        {DAY_SHORT[d - 1]}
      </button>
    {/each}
  </div>
  {#if empty && !days.length}<p class="dchips-empty" id="{idPrefix}-empty">{empty}</p>{/if}
</div>

<style>
  .dchips-field { min-width: 0; }
  .dchips { display: flex; gap: 4px; }
  .dchip {
    flex: 1 1 0;
    min-width: 40px;
    max-width: 72px;
    min-height: 32px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    font: 500 13px/1 var(--font-ui);
    color: var(--muted);
    cursor: pointer;
  }
  .dchip:hover { border-color: var(--line-strong); background: var(--well); color: var(--ink); }
  .dchip.on, .dchip.on:hover { background: var(--hover-ink); border-color: var(--hover-ink); color: var(--on-ink); }
  .dchip:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
  .dchips-empty { margin: 6px 0 0; font-size: 12.5px; color: var(--muted); }

  @media (max-width: 700px) {
    /* 40px tall; width flexes so seven chips fit a 390px phone beside the nav rail (~39px each). */
    .dchip { min-height: 40px; min-width: 32px; }
  }
</style>
