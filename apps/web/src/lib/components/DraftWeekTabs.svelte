<script lang="ts">
  import Icon from "$lib/ui/Icon.svelte";

  /**
   * Week tabs over a draft that carries several weeks: "W1 · W2 · …", with
   * the A/B letter when the block alternates ("W1 A · W2 B") and a lock on
   * weeks the trainer wrote (fill drafts). `changed` dots the weeks a version
   * changed. Same look as the program page's week tabs.
   */
  interface Props {
    weeks: { week: number; rotation?: "A" | "B" | null; locked?: boolean | null }[];
    value: number;
    onchange: (week: number) => void;
    /** Weeks with changes since the version before (a dot). */
    changed?: ReadonlySet<number>;
    label?: string;
  }

  let { weeks, value, onchange, changed, label = "Draft week" }: Props = $props();
</script>

<div class="week-tabs" role="tablist" aria-label={label}>
  {#each weeks as w (w.week)}
    <button
      type="button"
      role="tab"
      class="tab-btn"
      class:active={w.week === value}
      aria-selected={w.week === value}
      title={w.locked ? `Week ${w.week} — yours, kept as written` : undefined}
      onclick={() => onchange(w.week)}
    >
      W{w.week}{#if w.rotation}<span class="tab-letter" aria-label="week {w.rotation}">{w.rotation}</span>{/if}
      {#if w.locked}<span class="tab-lock" aria-label="locked"><Icon name="lock" /></span>{/if}
      {#if changed?.has(w.week)}<span class="tab-dot" aria-label="changed"></span>{/if}
    </button>
  {/each}
</div>

<style>
  .week-tabs { display: flex; gap: 6px; overflow-x: auto; min-width: 0; padding-bottom: 2px; }
  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: none;
    padding: 6px 12px;
    font: 600 13px var(--font-ui);
    color: var(--muted);
    cursor: pointer;
    border-radius: var(--radius);
    white-space: nowrap;
  }
  .tab-btn.active { background: var(--well); color: var(--ink); }
  .tab-btn:hover:not(.active) { background: var(--well-2); }
  .tab-letter { font: 500 11px var(--font-mono); color: var(--muted); }
  .tab-btn.active .tab-letter { color: inherit; }
  .tab-lock { display: inline-grid; color: var(--muted); }
  .tab-lock :global(svg) { width: 11px; height: 11px; }
  .tab-dot { width: 5px; height: 5px; border-radius: 99px; background: var(--blue); }
</style>
