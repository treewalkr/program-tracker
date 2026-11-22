<script lang="ts">
  /**
   * One figure with its label and a muted line of context: "Session load ·
   * 546 · target 600 AU". Hairline box, mono tabular figure. Lay several in a
   * grid; the tile fills its cell.
   */
  interface Props {
    label: string;
    value: string;
    /** Small muted text right after the figure ("of 3"). */
    of?: string;
    /** Muted line under the figure ("plan 2:13"). */
    sub?: string;
    tone?: "neutral" | "good" | "warn";
  }

  let { label, value, of, sub, tone = "neutral" }: Props = $props();
</script>

<div class="tile {tone}">
  <span class="lb">{label}</span>
  <span class="fig">{value}{#if of}<span class="of">{of}</span>{/if}</span>
  {#if sub}<span class="sub">{sub}</span>{/if}
</div>

<style>
  .tile { display: grid; gap: 2px; align-content: start; min-width: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .lb { font: 500 12px var(--font-ui); color: var(--muted); }
  .fig { font: 600 22px/1.2 var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink); }
  .of { margin-left: 6px; font: 400 13px var(--font-ui); color: var(--muted); }
  .sub { font-size: 12px; color: var(--muted); }
  .good .fig { color: var(--good); }
  .warn .fig { color: var(--warn-ink, var(--ink)); }
</style>
