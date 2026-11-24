<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * Where a member's AI draft stands — ready for review, approved but not
   * active, live, or cancelled. One status row: lamp, bold title, a muted
   * line, then the actions; the actions drop under the text on phones.
   * Shared by the member page and the generate form.
   */
  interface Props {
    /** waiting = amber (something to do), done = green, quiet = gray. */
    tone?: "waiting" | "done" | "quiet";
    title: string;
    text?: string;
    actions?: Snippet;
    class?: string;
  }

  let { tone = "waiting", title, text, actions, class: cls }: Props = $props();
  const lamp = $derived(tone === "done" ? "green" : tone === "quiet" ? "gray" : "amber");
</script>

<div class={["draft-banner", tone, cls]} role="status">
  <span class="lamp {lamp}" aria-hidden="true"></span>
  <div class="text">
    <strong>{title}</strong>
    {#if text}<span>{text}</span>{/if}
  </div>
  {#if actions}<div class="act">{@render actions()}</div>{/if}
</div>

<style>
  .draft-banner {
    display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap;
    border: 1px solid var(--warn-line); background: var(--warn-bg);
    border-radius: 6px; padding: 12px 14px;
  }
  .draft-banner.quiet { background: var(--well); border-color: var(--line); }
  .draft-banner.done { background: var(--good-bg); border-color: var(--good-line); }
  .lamp { display: inline-block; width: 8px; height: 8px; border-radius: 99px; flex: none; align-self: flex-start; margin-top: 6px; }
  .text { flex: 1; min-width: min(240px, calc(100% - 20px)); display: flex; flex-direction: column; gap: 2px; }
  .text span { color: var(--muted); font-size: 13px; }
  .act { display: flex; gap: 8px; flex-wrap: wrap; }
  /* Phones: actions on their own row, lined up under the text. */
  @media (max-width: 600px) {
    .act { flex-basis: 100%; padding-left: 20px; }
  }
</style>
