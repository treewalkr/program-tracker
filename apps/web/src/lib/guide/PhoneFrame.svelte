<script lang="ts">
  import type { Snippet } from "svelte";

  /** A plain phone outline: a bezel, a safe-area strip, and the screen. No device brand, no glare. */
  let { children, height = 540 }: { children: Snippet; height?: number } = $props();
</script>

<div class="phone" style:height="{height}px">
  <div class="screen">{@render children()}</div>
</div>

<style>
  .phone {
    flex: none;
    width: 320px;
    max-width: 100%;
    padding: 8px;
    border: 1px solid var(--line-strong);
    border-radius: 28px;
    background: var(--ink);
  }
  .screen {
    position: relative;
    height: 100%;
    overflow: hidden;
    padding: 12px 12px 0;
    border-radius: 21px;
    background: var(--surface);
    color: var(--ink);
    font-family: var(--font-ui);
  }
  /* the page fades out at the bottom edge, so a cut-off list reads as "scrolls on" */
  .screen::after {
    content: "";
    position: absolute;
    inset: auto 0 0;
    height: 48px;
    background: linear-gradient(to bottom, transparent, var(--surface));
    pointer-events: none;
  }
</style>
