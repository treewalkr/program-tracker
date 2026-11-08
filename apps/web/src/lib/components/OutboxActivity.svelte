<script lang="ts">
  import type { HourBucket } from "$lib/emailOutbox";
  import Tooltip from "$lib/ui/Tooltip.svelte";

  /**
   * Last 24 hours of sends as one row of hourly cells on the contributions
   * ramp (done-1…4, scaled to the busiest hour). An hour with a failed
   * attempt carries a red tick under its cell. Purely presentational —
   * buckets come from `hourlyBuckets`.
   */
  let { buckets }: { buckets: HourBucket[] } = $props();

  const peak = $derived(Math.max(1, ...buckets.map((b) => b.sent)));
  const sent = $derived(buckets.reduce((n, b) => n + b.sent, 0));
  const failed = $derived(buckets.reduce((n, b) => n + b.failed, 0));

  /** 0 = empty, 1–4 = ramp step. */
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / peak) * 4)));

  const hour = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const tip = (b: HourBucket) =>
    `${hour(b.start)} · ${b.sent} sent${b.failed ? ` · ${b.failed} failed` : ""}`;

  const summary = $derived(
    `Last 24 hours: ${sent} sent${failed ? `, ${failed} failed attempts` : ""}; busiest hour ${peak} sent.`,
  );
</script>

<div class="activity">
  <div class="head">
    <span class="title">Last 24 h</span>
    <span class="legend" aria-hidden="true">
      Less
      {#each [0, 1, 2, 3, 4] as l (l)}<i class="sw l{l}"></i>{/each}
      More
      <span class="fail-key"><i class="tick"></i>failed</span>
    </span>
  </div>
  <ol class="cells" aria-label={summary}>
    {#each buckets as b (b.start)}
      <li>
        <Tooltip text={tip(b)}>
          {#snippet children(id)}
            <span class="cell l{level(b.sent)}" class:failed={b.failed > 0} role="img" aria-label={tip(b)} aria-describedby={id}></span>
          {/snippet}
        </Tooltip>
      </li>
    {/each}
  </ol>
  {#if buckets.length}
    <div class="axis" aria-hidden="true">
      <span>{hour(buckets[0].start)}</span>
      <span>{hour(buckets[Math.floor(buckets.length / 2)].start)}</span>
      <span>now</span>
    </div>
  {/if}
</div>

<style>
  .activity { padding: 12px 16px 10px; }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .title {
    font: 600 12px/1.2 var(--font-ui);
    color: var(--ink);
  }
  .legend {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font: 400 11px/1 var(--font-ui);
    color: var(--faint);
  }
  .sw {
    width: 10px;
    height: 10px;
    border-radius: 4px;
  }
  .fail-key {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 10px;
  }
  .tick {
    width: 10px;
    height: 2px;
    border-radius: 99px;
    background: var(--bad);
  }
  .cells {
    list-style: none;
    margin: 0;
    padding: 0 0 4px;
    display: grid;
    grid-template-columns: repeat(24, minmax(0, 1fr));
    gap: 3px;
  }
  .cells li { display: flex; min-width: 0; }
  .cells li :global(.anchor) { display: flex; flex: 1; }
  .cell {
    position: relative;
    flex: 1;
    height: 22px;
    border-radius: 4px;
    outline: 1px solid var(--cell-edge);
    outline-offset: -1px;
  }
  /* failure tick hangs just below the cell */
  .cell.failed::after {
    content: "";
    position: absolute;
    left: 15%;
    right: 15%;
    bottom: -4px;
    height: 2px;
    border-radius: 99px;
    background: var(--bad);
  }
  .l0 { background: var(--well-2); }
  .l1 { background: var(--done-1); }
  .l2 { background: var(--done-2); }
  .l3 { background: var(--done-3); }
  .l4 { background: var(--done-4); }
  .axis {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    font: 400 11px/1 var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--faint);
  }

  @media (max-width: 560px) {
    .activity { padding: 10px 12px 8px; }
    .cells { gap: 2px; }
    .cell { height: 16px; }
  }
</style>
