<script lang="ts">
  /** ISO weekday toggles: 1=Mon … 7=Sun. Bindable — sorted on toggle. */
  let { days = $bindable() }: { days: number[] } = $props();

  const LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function toggle(d: number) {
    days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b);
  }
</script>

<div class="wd-row" role="group" aria-label="Training weekdays">
  {#each LABELS as label, i (label)}
    <button
      type="button"
      class="wd"
      class:on={days.includes(i + 1)}
      aria-pressed={days.includes(i + 1)}
      onclick={() => toggle(i + 1)}
    >
      {label}
    </button>
  {/each}
</div>

<style>
  .wd-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .wd {
    font: 600 12.5px var(--font-ui);
    padding: 5px 11px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
  }
  .wd:hover {
    border-color: var(--ink);
    color: var(--ink);
  }
  .wd:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  .wd.on {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }
</style>
