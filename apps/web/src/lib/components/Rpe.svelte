<script lang="ts">
  /** RPE value 1–10 with functional color (green ≤6 · amber 7–8 · red 9–10). */
  let { value }: { value?: number } = $props();

  const cls = $derived(value == null ? "" : value <= 6 ? "low" : value <= 8 ? "mid" : "high");
</script>

{#if value != null}
  <span class="rpe {cls}">{value}</span>
{:else}
  <span class="subtle">—</span>
{/if}
