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

<div class="health" role="group" aria-label="Outbox health — press a count to filter the list">
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
      <span class="n">{lag === null ? "—" : span(lag)}</span>
    </div>
  {/if}
</div>

<style>
  /* Each cell draws its right and bottom hairline as a 1px shadow into its
     margin, so wrapped rows keep a clean grid at any width. The strip runs
     1px past the panel's right edge and clips it, so the last column's line
     never doubles the panel border; the bottom line separates what follows
     (and is clipped too when nothing does). */
  .health {
    display: flex;
    flex-wrap: wrap;
    margin-right: -1px;
    clip-path: inset(0 1px 0 0);
  }
  .health:last-child {
    margin-bottom: -1px;
    clip-path: inset(0 1px 1px 0);
  }
  .cell {
    flex: 1 1 120px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 12px 16px;
    margin: 0 1px 1px 0;
    box-shadow: 1px 0 0 var(--line-soft), 0 1px 0 var(--line-soft);
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
    box-shadow: inset 0 -2px 0 var(--tab-on), 1px 0 0 var(--line-soft), 0 1px 0 var(--line-soft);
  }
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
  .lag .n { color: var(--muted); }
  .lag.late .n { color: var(--warn); }
  .lag.late .label::after {
    content: "· slow";
    color: var(--warn);
  }

  @media (max-width: 560px) {
    .cell {
      flex-basis: 30%;
      padding: 10px 12px;
    }
    .n { font-size: 16px; }
  }
  @media (prefers-reduced-motion: reduce) {
    button.cell { transition: none; }
  }
</style>
