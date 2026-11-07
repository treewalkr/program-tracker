<script lang="ts">
  import { formatElapsed } from '$lib/generation';

  interface Props {
    startedAt: string;
    providerLabel: string;
    model: string;
  }

  let { startedAt, providerLabel, model }: Props = $props();

  let now = $state(Date.now());
  let startedAtMs = $derived(new Date(startedAt).getTime());

  $effect(() => {
    now = Date.now();
    const interval = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(interval);
  });
</script>

<div class="generating-state" aria-busy="true">
  <div class="heading" role="status">
    <span class="spinner" aria-hidden="true"></span>
    <h2 class="title">Drafting your next block…</h2>
  </div>
  <div class="meta">{providerLabel} · {model}</div>

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
  .heading {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .spinner {
    width: 16px;
    height: 16px;
    border-radius: 99px;
    border: 2px solid var(--blue-line);
    border-top-color: var(--blue);
    animation: spin 0.9s linear infinite;
    flex: none;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 3s;
    }
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
