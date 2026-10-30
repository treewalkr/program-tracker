<script lang="ts">
  import { formatElapsed, progressFraction, typicalLabel } from '$lib/generation';

  interface Props {
    startedAt: string;
    providerLabel: string;
    model: string;
    expectedSeconds: number;
  }

  let { startedAt, providerLabel, model, expectedSeconds }: Props = $props();

  let now = $state(Date.now());
  let startedAtMs = $derived(new Date(startedAt).getTime());
  let elapsedMs = $derived(Math.max(0, now - startedAtMs));
  let fraction = $derived(progressFraction(elapsedMs, expectedSeconds));
  let pct = $derived(Math.round(fraction * 100));

  $effect(() => {
    now = Date.now();
    const interval = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(interval);
  });
</script>

<div class="generating-state">
  <h2 class="title">Drafting your next block…</h2>
  <div class="meta">{providerLabel} · {model} — {typicalLabel(expectedSeconds)}</div>

  <div class="track">
    <div
      class="bar"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={pct}
      aria-label="Draft generation progress"
      style="width: {pct}%;"
    ></div>
  </div>

  <div class="elapsed-row">
    <span class="elapsed mono">{formatElapsed(now - startedAtMs)} elapsed</span>
  </div>

  <p class="reassurance">
    You can leave this page — generation continues on the server, and the draft will wait here for your review.
  </p>
</div>

<style>
  .generating-state {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .title {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
    color: var(--ink);
  }
  .meta {
    font-size: 13px;
    color: var(--muted);
  }
  .track {
    width: 100%;
    height: 8px;
    background: var(--well-2, #eef1f4);
    border-radius: 99px;
    overflow: hidden;
    margin-top: 4px;
  }
  .bar {
    height: 100%;
    background: var(--blue, #0969da);
    border-radius: 99px;
    transition: width 1s linear;
  }
  .elapsed-row {
    display: flex;
    justify-content: flex-end;
  }
  .elapsed {
    font-size: 12px;
    color: var(--muted);
  }
  .mono {
    font-family: var(--font-mono, monospace);
  }
  .reassurance {
    margin: 4px 0 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--muted);
  }
</style>
