<script lang="ts">
  import type { Snippet } from "svelte";
  import { SESSION_BLOCK_NAMES, type SessionBlock } from "@pt/shared";
  import Pill from "$lib/ui/Pill.svelte";

  /**
   * The head of a session block: "Movement prep · not counted" or
   * "Main work · counted". The tag says how the block counts; `tag` swaps the
   * words (the portal's "tick when done"), `tag={null}` drops the pill.
   * `children` sits at the right end (a "3/4" tick count, a link).
   */
  let {
    block,
    tag,
    children,
  }: {
    block: SessionBlock;
    tag?: string | null;
    children?: Snippet;
  } = $props();

  const text = $derived(tag === undefined ? (block === "prep" ? "not counted" : "counted") : tag);
</script>

<div class="block-head" data-block={block}>
  <span class="name">{SESSION_BLOCK_NAMES[block]}</span>
  {#if text}<Pill tone={block === "main" && tag === undefined ? "good" : "neutral"}>{text}</Pill>{/if}
  {#if children}<span class="end">{@render children()}</span>{/if}
</div>

<style>
  .block-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 24px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink);
  }
  .block-head[data-block="prep"] .name {
    color: var(--muted);
  }
  .end {
    margin-left: auto;
    font-weight: 400;
    color: var(--muted);
  }
</style>
