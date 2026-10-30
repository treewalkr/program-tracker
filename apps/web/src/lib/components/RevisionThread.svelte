<script lang="ts">
  export interface RevisionEntry {
    version: number;
    message: string;
    createdAt: string;
  }

  let { entries }: { entries: RevisionEntry[] } = $props();

  function formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
</script>

<div class="revision-thread">
  {#each entries as entry}
    <div class="revision-entry">
      <div class="revision-header">
        <span class="revision-badge">v{entry.version}</span>
        <span class="revision-time">{formatTime(entry.createdAt)}</span>
      </div>
      <div class="revision-message">{entry.message}</div>
    </div>
  {/each}
</div>

<style>
  .revision-thread {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .revision-entry {
    background: var(--well);
    border: 1px solid var(--line-soft);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
  }

  .revision-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .revision-badge {
    font-weight: 600;
    color: var(--ink);
    font-size: 12px;
  }

  .revision-time {
    color: var(--faint);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .revision-message {
    color: var(--ink);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;
  }
</style>
