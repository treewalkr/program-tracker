<script lang="ts">
  import type { FeedbackAuthor } from "@pt/shared";
  import Avatar from "$lib/ui/Avatar.svelte";

  /** Who wrote a feedback item or reply: Google photo when known, else initials. */
  let { author }: { author: FeedbackAuthor | null } = $props();
</script>

<span class="author" class:unknown={!author}>
  {#if author?.avatarUrl}
    <img src={author.avatarUrl} alt="" referrerpolicy="no-referrer" />
  {:else if author}
    <span class="mini"><Avatar name={author.name} /></span>
  {/if}
  <span class="name">{author?.name ?? "Unknown"}</span>
</span>

<style>
  .author {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: 500 13px/1 var(--font-ui);
    min-width: 0;
  }
  .author.unknown .name {
    color: var(--muted);
    font-weight: 400;
  }
  img,
  .mini :global(.avatar) {
    width: 20px;
    height: 20px;
    border-radius: 99px;
    font-size: 9px;
    flex: none;
  }
  .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
