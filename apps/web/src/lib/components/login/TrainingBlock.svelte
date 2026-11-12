<script lang="ts">
  import type { TrainingWeeks } from "$lib/loginTheme";

  /**
   * Decorative heatmap of training days on the accent ramp (--accent-1…4,
   * falling back to the app's --done ramp). `rows` = one row per week (the
   * block pulse); `columns` = one column per week (a contributions graph).
   * `dark` draws the always-dark ramp, for layouts on a fixed dark canvas.
   * A parent can resize the cells responsively by setting --block-cell.
   */
  interface Props {
    weeks: TrainingWeeks;
    cell?: number;
    gap?: number;
    axis?: "rows" | "columns";
    dark?: boolean;
    class?: string;
  }

  let { weeks, cell = 10, gap = 3, axis = "rows", dark = false, class: cls }: Props = $props();
</script>

<div class={["block", axis, dark && "dark", cls]} style:--cell="{cell}px" style:--gap="{gap}px" aria-hidden="true">
  {#each weeks as week, w (w)}
    {#each week as level, d (d)}
      <span class="day" data-level={level}></span>
    {/each}
  {/each}
</div>

<style>
  .block {
    display: grid;
    gap: var(--gap);
  }
  .rows {
    grid-template-columns: repeat(7, var(--block-cell, var(--cell)));
    grid-auto-rows: var(--block-cell, var(--cell));
  }
  .columns {
    grid-template-rows: repeat(7, var(--block-cell, var(--cell)));
    grid-auto-columns: var(--block-cell, var(--cell));
    grid-auto-flow: column;
  }
  .day {
    border-radius: 2px;
    background: var(--well-2);
    outline: 1px solid var(--cell-edge);
    outline-offset: -1px;
  }
  .day[data-level="1"] { background: var(--accent-1, var(--done-1)); }
  .day[data-level="2"] { background: var(--accent-2, var(--done-2)); }
  .day[data-level="3"] { background: var(--accent-3, var(--done-3)); }
  .day[data-level="4"] { background: var(--accent-4, var(--done-4)); }

  .dark .day {
    background: #212830;
    outline-color: rgba(240, 246, 252, 0.05);
  }
  .dark .day[data-level="1"] { background: var(--accent-dark-1); }
  .dark .day[data-level="2"] { background: var(--accent-dark-2); }
  .dark .day[data-level="3"] { background: var(--accent-dark-3); }
  .dark .day[data-level="4"] { background: var(--accent-dark-4); }
</style>
