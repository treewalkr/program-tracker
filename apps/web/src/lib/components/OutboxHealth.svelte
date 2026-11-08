<script lang="ts">
  import { span, type OutboxCounts, type OutboxFilter } from "$lib/emailOutbox";

  /**
   * Outbox health counters that double as filters (aria-pressed). Pressing
   * the active counter again clears the filter. Queue counters and queue lag
   * only exist for outbox data; the send log shows Failed and Sent alone.
   * Sits flush inside a panel — the page supplies the box.
   */
  interface Props {
    counts: OutboxCounts;
    /** Age in ms of the oldest queued message; null when nothing waits. */
    lag: number | null;
    source: "log" | "outbox";
    filter: OutboxFilter;
    onfilter: (f: OutboxFilter) => void;
  }

  let { counts, lag, source, filter, onfilter }: Props = $props();

  /** Lag past this turns amber. */
  const LAG_WARN = 5 * 60_000;

  type Cell = { id: OutboxFilter; label: string; n: number; dot: string; tone?: "warn" | "bad" };

  /** "4 min" → number in figures, unit in small type. */
  const lagParts = $derived(lag === null ? null : (span(lag).match(/^(\S+)\s(.+)$/)?.slice(1) ?? [span(lag), ""]));

  const cells = $derived.by<Cell[]>(() => {
    const failed: Cell = { id: "failed", label: "Failed", n: counts.dead, dot: "red", tone: counts.dead ? "bad" : undefined };
    const sent: Cell = { id: "sent", label: "Sent · 24 h", n: counts.sent24h, dot: "green" };
    if (source === "log") return [failed, sent];
    return [
      { id: "queued", label: "Queued", n: counts.queued, dot: "gray" },
      { id: "sending", label: "Sending", n: counts.sending, dot: "blue" },
      { id: "retrying", label: "Retrying", n: counts.retrying, dot: "amber", tone: counts.retrying ? "warn" : undefined },
      failed,
      sent,
    ];
  });
</script>

<div class="health" class:log={source === "log"} role="group" aria-label="Outbox health — press a count to filter the list">
  {#each cells as c (c.id)}
    <button
      type="button"
      class="cell"
      aria-pressed={filter === c.id}
      onclick={() => onfilter(filter === c.id ? "all" : c.id)}
    >
      <span class="label"><span class="dot {c.dot}" aria-hidden="true"></span>{c.label}</span>
      <span class="n {c.tone}">{c.n}</span>
    </button>
  {/each}
  {#if source === "outbox"}
    <div class="cell lag" class:late={lag !== null && lag > LAG_WARN}>
      <span class="label">Oldest waiting</span>
      <span class="n">
        {#if lagParts}{lagParts[0]}<span class="unit">{" "}{lagParts[1]}</span>{:else}—{/if}
      </span>
    </div>
  {/if}
</div>

<style>
  /* Hairline grid: the 1px gaps show the line colour behind the cells. The
     panel draws the outer edge; the strip's own bottom line separates it
     from what follows. Six across, three by two in a narrow main column —
     both fill every row, so no stray gap shows. */
  .health {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 1px;
    background: var(--line-soft);
    border-bottom: 1px solid var(--line-soft);
  }
  .health.log { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .health:last-child { border-bottom: none; }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
    padding: 12px 16px;
    background: var(--surface);
    border: none;
    font: inherit;
    color: inherit;
    text-align: left;
  }
  button.cell {
    appearance: none;
    cursor: pointer;
    transition: background-color 120ms;
  }
  button.cell:hover { background: var(--row-hover); }
  button.cell[aria-pressed="true"] {
    background: var(--well);
    box-shadow: inset 0 -2px 0 var(--tab-on);
  }
  button.cell:focus-visible { outline-offset: -2px; }
  button.cell[aria-pressed="true"] .label { color: var(--ink); font-weight: 600; }
  .label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: 500 12px/1.2 var(--font-ui);
    color: var(--muted);
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 99px;
    flex: none;
  }
  .dot.gray { background: var(--lamp-gray); }
  .dot.blue { background: var(--blue); }
  .dot.amber { background: var(--lamp-amber); }
  .dot.red { background: var(--bad); }
  .dot.green { background: var(--green-btn); }
  .n {
    font: 600 20px/1 var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .n.warn { color: var(--warn); }
  .n.bad { color: var(--bad); }
  .unit {
    white-space: pre;
    font: 500 12px/1 var(--font-ui);
    color: var(--muted);
  }
  .lag .n { color: var(--muted); }
  .lag.late .n { color: var(--warn); }
  .lag.late .label::after {
    content: "· slow";
    color: var(--warn);
  }

  @container main (max-width: 720px) {
    .health:not(.log) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .cell { padding: 10px 12px; }
    .n { font-size: 16px; }
  }
  @media (prefers-reduced-motion: reduce) {
    button.cell { transition: none; }
  }
</style>
