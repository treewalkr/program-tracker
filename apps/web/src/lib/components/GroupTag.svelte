<script lang="ts">
  /** Superset position tag — "A1", "A2" — in mono, neutral. */
  let { tag }: { tag: string } = $props();
</script>

<span class="gtag" title="Superset {tag[0]}, exercise {tag.slice(1)}">{tag}</span>

<style>
  .gtag {
    display: inline-flex;
    align-items: center;
    flex: none;
    font: 600 11px/1 var(--font-mono);
    font-variant-numeric: tabular-nums;
    padding: 2px 5px;
    border-radius: 4px;
    border: 1px solid var(--line);
    background: var(--well);
    color: var(--muted);
  }
</style>
