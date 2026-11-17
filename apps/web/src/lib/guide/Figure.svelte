<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * A drawn specimen of the real screen, not a screenshot: it stays crisp,
   * follows the theme and language, and nothing inside it is interactive
   * (`inert`), so a reader never mistakes the picture for the product.
   * `controls` sits above the picture, outside the inert stage.
   */
  let { caption, children, controls }: { caption: string; children: Snippet; controls?: Snippet } = $props();
</script>

<figure class="fig">
  {#if controls}<div class="controls">{@render controls()}</div>{/if}
  <div class="stage" inert>{@render children()}</div>
  <figcaption>{caption}</figcaption>
</figure>

<style>
  .fig { margin: 4px 0 16px; }
  .controls { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-bottom: 6px; font-size: 13px; color: var(--muted); }
  .stage { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--well); overflow: hidden; container-type: inline-size; }
  figcaption { margin-top: 6px; font-size: 13px; line-height: 1.5; color: var(--muted); text-wrap: pretty; }
  @media (max-width: 640px) { .stage { padding: 12px; } }
</style>
