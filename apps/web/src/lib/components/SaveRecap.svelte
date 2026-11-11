<script lang="ts">
  /**
   * What a session save just wrote, and the way on: the next client still to
   * log today (the screen's one green action), else back to the overview.
   * Sits in the log sheet's sticky save bar, where the Save tap left the eye.
   */
  import type { Snippet } from "svelte";
  import type { NextClient, RecapNote } from "$lib/logRecap";
  import Icon from "$lib/ui/Icon.svelte";

  export type NextState = { state: "loading" } | { state: "ready"; client: NextClient | null };

  interface Props {
    /** "Upper A logged". */
    title: string;
    /** "14 sets · 5 exercises"; null for cardio. */
    counts?: string | null;
    notes?: RecapNote[];
    next: NextState;
    overviewHref?: string;
    /** Right of the title: the Undo button while the window is open. */
    action?: Snippet;
    /** Seconds the undo window runs: a hairline drains along the bottom. */
    drain?: number | null;
  }

  let { title, counts = null, notes = [], next, overviewHref = "/", action, drain = null }: Props = $props();
</script>

<section class="recap" aria-label="Saved">
  <div class="top">
    <p class="title" role="status">
      <Icon name="check" />
      <span class="title-text"><strong>{title}</strong>{#if counts}<span class="counts tnum"><span class="sep">{" · "}</span>{counts}</span>{/if}</span>
    </p>
    {#if action}<div class="action">{@render action()}</div>{/if}
  </div>

  {#if notes.length}
    <ul class="notes">
      {#each notes as n (n.text)}
        <li class={n.tone}>{#if n.tone !== "muted"}<span class="dot" aria-hidden="true"></span>{/if}{n.text}</li>
      {/each}
    </ul>
  {/if}

  <div class="next" aria-live="polite">
    {#if next.state === "loading"}
      <span class="faint">Checking who's next today…</span>
    {:else if next.client}
      <a class="btn primary next-btn" href={next.client.href}>
        <span class="next-label">Next: <strong>{next.client.name}</strong><span class="next-session">{" · "}{next.client.session}</span></span>
        <Icon name="chevron" />
      </a>
      <a class="overview" href={overviewHref}>Overview</a>
    {:else}
      <span class="subtle">Everyone due today is logged.</span>
      <a class="btn overview-btn" href={overviewHref}>Back to overview</a>
    {/if}
  </div>

  {#if drain}
    <span class="drain" aria-hidden="true" style:animation-duration={`${drain}s`}></span>
  {/if}
</section>

<style>
  .recap {
    position: relative;
    display: grid;
    gap: 8px;
    padding: 10px 12px 12px;
    background: var(--good-bg);
    border: 1px solid var(--good-line);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .top { display: flex; align-items: center; gap: 12px; min-height: 28px; }
  .title {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--good);
    font: 400 14px/1.4 var(--font-ui);
  }
  .title :global(svg) { flex: 0 0 auto; width: 16px; height: 16px; align-self: center; }
  .title strong { font-weight: 600; }
  .counts { color: var(--ink); font-family: var(--font-mono); font-size: 13px; }
  .action { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }

  .notes { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; padding: 0 0 0 22px; list-style: none; font-size: 13px; }
  .notes li { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
  .notes li.bad { color: var(--bad); font-weight: 500; }
  .notes li.warn { color: var(--warn-ink); font-weight: 500; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  .next { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; padding-left: 22px; min-height: 32px; }
  .next-btn { gap: 8px; max-width: 100%; }
  .next-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
  .next-label strong { font-weight: 600; }
  .next-btn :global(svg) { flex: 0 0 auto; width: 14px; height: 14px; transform: rotate(-90deg); }
  .overview { font-size: 13px; }

  .drain {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: var(--good);
    transform-origin: left;
    animation: drain linear forwards;
  }
  @keyframes drain {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
  }

  @media (max-width: 860px) {
    .recap { gap: 10px; }
    .notes, .next { padding-left: 0; }
    .title { align-items: flex-start; }
    .title :global(svg) { align-self: auto; margin-top: 2px; }
    .title-text { display: flex; flex-direction: column; gap: 2px; }
    .sep { display: none; }
    .next-btn { flex: 1 1 100%; justify-content: space-between; min-height: 44px; font-size: 15px; }
    .next .overview { margin: 0 auto; min-height: 32px; display: inline-flex; align-items: center; }
    .overview-btn { min-height: 44px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .drain { display: none; }
  }
</style>
