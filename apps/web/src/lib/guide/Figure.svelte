<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * A drawn specimen of the real screen, not a screenshot: it stays crisp,
   * follows the theme and language, and nothing inside it is interactive
   * (`inert`), so a reader never mistakes the picture for the product.
   */
  let { caption, children, tone = "well" }: { caption: string; children: Snippet; tone?: "well" | "plain" } = $props();
</script>

<figure class="fig">
  <div class={["stage", tone]} inert>{@render children()}</div>
  <figcaption>{caption}</figcaption>
</figure>

<style>
  .fig {
    margin: 4px 0 16px;
  }
  .stage {
    display: flex;
    justify-content: center;
    gap: 24px;
    padding: 20px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .stage.well {
    background: var(--well);
  }
  figcaption {
    margin-top: 6px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--muted);
  }
  @media (max-width: 640px) {
    .stage {
      padding: 12px;
    }
  }
</style>
