<script lang="ts">
  import type { WeekPlan } from "$lib/api/types";
  import { planIndexes } from "$lib/draftReview";

  /**
   * A scheme's silhouette: one column per week, its height the planned volume
   * chained from the week targets (week 1 = 100), tinted by directive. The
   * hairline marks week 1's level. `scale` is the volume that fills the full
   * height — pass one value to every shape on a page so they share an axis.
   */
  interface Props {
    weeks: WeekPlan[];
    scale?: number;
  }

  let { weeks, scale }: Props = $props();

  const vols = $derived(planIndexes({ weeks }).map((x) => x.vol));
  const top = $derived(scale ?? Math.max(120, ...vols));
  const h = (v: number) => Math.max(6, Math.min(100, (v / top) * 100));
  const label = $derived(
    `Planned volume, week 1 = 100: ${weeks.map((w, i) => `W${w.week} ${Math.round(vols[i])}`).join(", ")}`
  );
  const TONE: Record<string, string> = {
    "+volume": "vol",
    "+intensity": "int",
    deload: "dl",
    transition: "dl",
    test: "test",
  };
</script>

<span class="shape" role="img" aria-label={label} title={label}>
  <span class="base" style:bottom="{h(100)}%"></span>
  {#each weeks as w, i (w.week)}
    <i class={TONE[w.directive] ?? ""} style:height="{h(vols[i])}%"></i>
  {/each}
</span>

<style>
  .shape {
    position: relative;
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 36px;
    padding: 0 1px;
    flex: none;
  }
  .base {
    position: absolute;
    left: -3px;
    right: -3px;
    height: 1px;
    background: var(--line-strong);
    opacity: 0.6;
  }
  i {
    position: relative;
    width: 9px;
    border-radius: 2px 2px 0 0;
    background: var(--lamp-gray);
  }
  i.vol { background: var(--done-3); }
  i.int { background: var(--lamp-amber); }
  i.dl { background: var(--blue); }
  i.test { background: var(--hover-ink); }
</style>
