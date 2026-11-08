<script lang="ts">
  /**
   * The build in the sidebar's account row, linking to What's new. A blue
   * unread dot sits after it until this browser opens the page for the
   * newest release (see $lib/whatsNew.svelte).
   */
  interface Props {
    /** Build id, e.g. "0.1.9+42a93f5". */
    build: string;
    /** A release this browser hasn't opened What's new for yet. */
    fresh?: boolean;
  }

  let { build, fresh = false }: Props = $props();
</script>

<a
  class="version-link"
  href="/whats-new"
  title={fresh ? "New release — see what's new" : "What's new"}
  aria-label={fresh ? `v${build}, what's new — unread` : `v${build}, what's new`}
>v{build}{#if fresh}<span class="dot" aria-hidden="true"></span>{/if}</a>

<style>
  .version-link {
    color: inherit;
    text-decoration: none;
    border-radius: 4px;
  }
  .version-link:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-left: 5px;
    border-radius: 99px;
    background: var(--blue);
    vertical-align: 1px;
  }
</style>
