<script lang="ts">
  import { fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { prefersReducedMotion } from "svelte/motion";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import type { DraftNotice } from "$lib/generationWatch.svelte";

  /**
   * Draft-ready stack: AI drafts that finished (or failed) while the trainer
   * was elsewhere. Floats bottom-right over content (above the Feedback
   * launcher), top on phones. Each notice stays until dismissed; past three,
   * the older ones fold into "+N more".
   */
  interface Props {
    notices: DraftNotice[];
    /** Review / Open: the caller navigates and drops the notice. */
    onopen: (notice: DraftNotice) => void;
    ondismiss: (id: string) => void;
    ondismissall?: () => void;
    /** Shown before folding (default 3). */
    max?: number;
  }

  let { notices, onopen, ondismiss, ondismissall, max = 3 }: Props = $props();

  let expanded = $state(false);
  const shown = $derived(expanded ? notices : notices.slice(0, max));
  const folded = $derived(notices.length - shown.length);
  // Fold back once the overflow is gone, so the next burst starts collapsed.
  $effect(() => {
    if (notices.length <= max) expanded = false;
  });

  const enter = $derived({ y: prefersReducedMotion.current ? 0 : 12, duration: prefersReducedMotion.current ? 0 : 180, easing: cubicOut });
</script>

<section class="draft-notices" aria-label="Draft notifications" aria-live="polite">
  {#each shown as n (n.id)}
    <article class="notice {n.tone}" transition:fly={enter} aria-labelledby="dn-{n.id}">
      <span class="lamp {n.tone === 'ready' ? 'green' : 'red'}" aria-hidden="true"></span>
      <div class="text">
        <strong id="dn-{n.id}">{n.title}</strong>
        <span class="line">
          {#if n.tone === "ready"}
            Ready for your review.
          {:else}
            {n.reason ?? "The AI call didn't finish."} Your brief is kept.
          {/if}
        </span>
      </div>
      <div class="act">
        <Button small href={n.href} onclick={() => onopen(n)}>{n.tone === "ready" ? "Review" : "Open"}</Button>
        <button type="button" class="dismiss" aria-label="Dismiss: {n.title}" title="Dismiss" onclick={() => ondismiss(n.id)}>
          <Icon name="x" size={14} />
        </button>
      </div>
    </article>
  {/each}
  {#if folded > 0 || (expanded && notices.length > max) || (ondismissall && notices.length > 1)}
    <div class="more">
      {#if folded > 0}
        <button type="button" class="link" onclick={() => (expanded = true)}>+{folded} more</button>
      {:else if expanded && notices.length > max}
        <button type="button" class="link" onclick={() => (expanded = false)}>Show fewer</button>
      {/if}
      {#if ondismissall && notices.length > 1}
        <button type="button" class="link" onclick={ondismissall}>Dismiss all</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .draft-notices {
    position: fixed;
    right: 16px;
    /* Above the Feedback launcher (32px pill at bottom 16px), and whatever lifts it. */
    bottom: calc(60px + var(--feedback-lift, 0px));
    z-index: 9998;
    width: min(360px, calc(100vw - 32px));
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    pointer-events: none;
  }
  .draft-notices:empty {
    display: none;
  }
  .notice,
  .more {
    pointer-events: auto;
  }
  .notice {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    align-items: start;
    column-gap: 10px;
    padding: 10px 10px 10px 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-overlay);
    font: 400 13px/1.4 var(--font-ui);
    color: var(--ink);
  }
  .notice.failed {
    border-color: var(--bad-line);
  }
  .lamp {
    width: 8px;
    height: 8px;
    border-radius: 99px;
    margin-top: 6px;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  strong {
    font-size: 14px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .line {
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .act {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .dismiss {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .dismiss:hover {
    background: var(--hover-soft);
    color: var(--ink);
  }
  .more {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    font: 500 12px/1 var(--font-ui);
  }
  .link {
    padding: 4px 6px;
    border: 1px solid var(--line);
    border-radius: 99px;
    background: var(--surface);
    color: var(--muted);
    font: inherit;
    cursor: pointer;
  }
  .link:hover {
    color: var(--ink);
    border-color: var(--line-strong);
  }

  /* Touch: a 44px target for ✕; the negative margin keeps the row's height. */
  @media (hover: none) {
    .dismiss {
      width: 44px;
      height: 44px;
      margin: -9px -9px -9px 0;
    }
  }

  /* Phones: across the top, under the notch, clear of the bottom launcher
     and below the page's menu and search buttons (top bar ends ~56px). */
  @media (max-width: 520px) {
    .draft-notices {
      top: calc(env(safe-area-inset-top, 0px) + 64px);
      bottom: auto;
      left: 8px;
      right: 8px;
      width: auto;
      flex-direction: column;
    }
  }
</style>
