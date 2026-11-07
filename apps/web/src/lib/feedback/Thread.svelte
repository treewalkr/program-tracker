<script lang="ts">
  import { feedbackHandle, type FeedbackComment, type FeedbackItem } from "@pt/shared";
  import { fmtDate, fmtDateTime } from "$lib/format";
  import Button from "$lib/ui/Button.svelte";
  import Tooltip from "$lib/ui/Tooltip.svelte";
  import Author from "./Author.svelte";
  import { feedbackApi } from "./client";
  import { STATUS_LABEL } from "./status";

  /**
   * A feedback item's conversation: replies between the reporter and the
   * admin, with status changes as quiet system lines. Used on the feedback
   * page and in feedback-mode pins.
   */
  let { item, onposted }: { item: FeedbackItem; onposted?: (c: FeedbackComment) => void } = $props();

  let draft = $state("");
  let sending = $state(false);
  let error = $state<string | null>(null);
  /** Replies posted here before the parent refreshes `item`. */
  let posted = $state<FeedbackComment[]>([]);
  const thread = $derived([...item.thread, ...posted.filter((p) => !item.thread.some((c) => c.id === p.id))]);
  const lastDoneId = $derived(thread.findLast((c) => c.kind === "status" && c.status === "done")?.id);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    sending = true;
    error = null;
    try {
      const c = await feedbackApi.reply(item.id, body);
      posted = [...posted, c];
      draft = "";
      onposted?.(c);
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not send reply";
    } finally {
      sending = false;
    }
  }

  /** Return adds a line; ⌘/Ctrl+Return sends, like the chat composer. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }
</script>

<div class="thread">
  {#if thread.length}
    <ol class="entries">
      {#each thread as c (c.id)}
        <li class={c.kind}>
          {#if c.kind === "status"}
            <span class="dot" aria-hidden="true"></span>
            <span class="sys">
              {c.author?.name ?? "Someone"} marked it <strong>{STATUS_LABEL[c.status!]}</strong>{#if c.id === lastDoneId && item.status === "done" && item.shippedIn}&nbsp;· shipped in v{item.shippedIn}{/if}
            </span>
            {@render when(c.createdAt)}
          {:else}
            <div class="head">
              <Author author={c.author} />
              {@render when(c.createdAt)}
            </div>
            <p class="body">{c.body}</p>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}

  <form class="composer" onsubmit={(e) => (e.preventDefault(), send())}>
    <textarea
      aria-label="Reply to {feedbackHandle(item.number)}"
      rows="1"
      placeholder="Reply…"
      bind:value={draft}
      {onkeydown}
      disabled={sending}
      maxlength="5000"
    ></textarea>
    <Button small type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Reply"}</Button>
  </form>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

{#snippet when(iso: string)}
  <Tooltip text={fmtDateTime(iso)}>
    {#snippet children(tipId)}
      <button type="button" class="when" aria-describedby={tipId}><time datetime={iso}>{fmtDate(iso)}</time></button>
    {/snippet}
  </Tooltip>
{/snippet}

<style>
  .thread {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: var(--measure-prose);
  }
  .entries {
    list-style: none;
    margin: 0;
    padding: 0 0 0 12px;
    border-left: 2px solid var(--line-soft);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .body {
    margin: 4px 0 0 26px;
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  li.status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--muted);
  }
  .sys strong {
    font-weight: 600;
    color: var(--ink);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 99px;
    background: var(--line-strong);
    margin: 0 7px 0 7px;
    flex: none;
  }
  button.when {
    appearance: none;
    background: none;
    border: 0;
    padding: 0;
    border-radius: 4px;
    font: 400 12px/1 var(--font-ui);
    color: var(--muted);
    cursor: default;
  }
  button.when:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .composer {
    display: flex;
    align-items: flex-end;
    gap: 6px;
  }
  .composer textarea {
    flex: 1;
    min-width: 0;
    field-sizing: content;
    min-height: 32px;
    max-height: 200px;
    font: 400 13px/1.5 var(--font-ui);
    padding: 5px 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    resize: none;
    color: var(--ink);
    background: var(--bg);
  }
  .composer textarea:focus {
    outline: none;
    border-color: var(--blue);
    box-shadow: 0 0 0 3px var(--focus);
  }
  .composer :global(.btn) {
    min-height: 32px;
  }
  .error {
    margin: 0;
    font-size: 12px;
    color: var(--bad);
  }
</style>
