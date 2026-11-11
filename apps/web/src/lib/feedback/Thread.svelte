<script lang="ts">
  import { tick } from "svelte";
  import { FEEDBACK_AI_AUTHOR_NAME, feedbackHandle, type FeedbackComment, type FeedbackItem } from "@pt/shared";
  import { fmtDate, fmtDateTime } from "$lib/format";
  import { renderSafeMarkdown } from "$lib/markdown";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Tooltip from "$lib/ui/Tooltip.svelte";
  import Author from "./Author.svelte";
  import { attachmentImages, feedbackApi } from "./client";
  import AttachmentInput from "./AttachmentInput.svelte";
  import AttachmentStrip from "./AttachmentStrip.svelte";
  import { ImageTray } from "./tray.svelte";
  import { entryAuthorName, statusLine } from "./status";
  import { AI_CONFIDENCE_LABEL, AI_CONFIDENCE_TONE, AI_RISK_LABEL, AI_RISK_TONE, AI_VERDICT_LABEL } from "./ai";

  /**
   * A feedback item's conversation: replies between the reporter and the
   * admin, with status changes as quiet system lines. Used on the feedback
   * page and in feedback-mode pins.
   *
   * AI entries: a sent answer is badged; an unsent draft is a card the admin
   * sends (as is or edited) or discards; a private triage note is a muted
   * block. Only the admin's item ever carries drafts and notes.
   */
  interface Props {
    item: FeedbackItem;
    onposted?: (c: FeedbackComment) => void;
    /** The item after an admin sends or discards an AI entry. */
    onchange?: (next: FeedbackItem) => void;
    /** Start with a "Reply" link that opens the composer (the feedback page's calmer cards). */
    collapsible?: boolean;
  }
  let { item, onposted, onchange, collapsible = false }: Props = $props();

  let draft = $state("");
  const tray = new ImageTray();
  let sending = $state(false);
  const canSend = $derived(!sending && !tray.busy && (draft.trim() !== "" || tray.images.length > 0));
  let error = $state<string | null>(null);
  /** Collapsible threads: the composer was opened; it also stays open while it holds a draft. */
  let opened = $state(false);
  const expanded = $derived(!collapsible || opened || draft.trim() !== "" || tray.images.length > 0);
  let field = $state<HTMLTextAreaElement | null>(null);
  let opener = $state<HTMLButtonElement | null>(null);

  async function openComposer() {
    opened = true;
    await tick();
    field?.focus();
  }

  /** Esc on an empty composer folds it back to the link. */
  async function closeComposer() {
    if (!collapsible || draft.trim() || tray.images.length) return;
    opened = false;
    await tick();
    opener?.focus();
  }
  /** Replies posted here before the parent refreshes `item`. */
  let posted = $state<FeedbackComment[]>([]);
  const thread = $derived([...item.thread, ...posted.filter((p) => !item.thread.some((c) => c.id === p.id))]);
  const lastDoneId = $derived(thread.findLast((c) => c.kind === "status" && c.status === "done")?.id);

  async function send() {
    if (!canSend) return;
    const body = draft.trim();
    sending = true;
    error = null;
    try {
      const c = await feedbackApi.reply(item.id, body, tray.files);
      posted = [...posted, c];
      draft = "";
      tray.clear();
      onposted?.(c);
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not send reply";
    } finally {
      sending = false;
    }
  }

  /** The draft being edited, and its text. */
  let editing = $state<string | null>(null);
  let editText = $state("");
  /** The AI entry with a request in flight. */
  let busyId = $state<string | null>(null);
  let aiError = $state<{ id: string; message: string } | null>(null);

  async function aiAction(c: FeedbackComment, run: () => Promise<FeedbackItem>) {
    if (busyId) return;
    busyId = c.id;
    aiError = null;
    try {
      const next = await run();
      editing = null;
      onchange?.(next);
    } catch (err) {
      aiError = { id: c.id, message: err instanceof Error ? err.message : "That didn't work" };
    } finally {
      busyId = null;
    }
  }
  const sendDraft = (c: FeedbackComment) =>
    aiAction(c, () => feedbackApi.publishDraft(item.id, c.id, editing === c.id ? editText.trim() : undefined));
  const discard = (c: FeedbackComment) => aiAction(c, () => feedbackApi.discardAi(item.id, c.id));
  function startEdit(c: FeedbackComment) {
    editing = c.id;
    editText = c.body ?? "";
  }

  /** "Ana's reply", for image names. */
  const replyOf = (c: FeedbackComment) => {
    const who = c.author || c.authorKind !== "human" ? entryAuthorName(c) : null;
    return who ? `${who}'s reply` : "a reply";
  };

  /** Return adds a line; ⌘/Ctrl+Return sends, like the chat composer. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) {
      e.preventDefault();
      send();
    }
    if (e.key === "Escape") closeComposer();
  }
</script>

<div class="thread">
  {#if thread.length}
    <ol class="entries">
      {#each thread as c (c.id)}
        <li class={c.kind}>
          {#if c.kind === "status"}
            {@const line = statusLine(c, { latestDone: c.id === lastDoneId && item.status === "done", shippedIn: item.shippedIn })}
            <span class="dot" class:release={c.authorKind === "system"} aria-hidden="true"></span>
            <span class="sys">
              {line.who} marked it <strong>{line.status}</strong>{#if line.tail}&nbsp;· {line.tail}{/if}
            </span>
            {@render when(c.createdAt)}
          {:else if c.visibility === "private"}
            {@render note(c)}
          {:else if c.visibility === "draft"}
            {@render draftCard(c)}
          {:else}
            <div class="head">
              {#if c.authorKind === "ai"}
                {@render aiAuthor()}
                <span class="ai-badge">AI answer</span>
              {:else if c.authorKind === "system"}
                <span class="release-author"><span class="release-mark" aria-hidden="true"><Icon name="check" /></span>{entryAuthorName(c)}</span>
                {#if c.ship}<code class="sha" title="Commit {c.ship.sha}">{c.ship.sha.slice(0, 7)}</code>{/if}
              {:else}
                <Author author={c.author} />
              {/if}
              {@render when(c.createdAt)}
            </div>
            {#if c.body}<div class="body md">{@html renderSafeMarkdown(c.body)}</div>{/if}
            {#if c.attachments.length}
              <div class="body images">
                <AttachmentStrip
                  images={attachmentImages(item.id, c.attachments, (_, n) => `image ${n} of ${c.attachments.length} in ${replyOf(c)}`)}
                  label="Images in {replyOf(c)} on {feedbackHandle(item.number)}"
                />
              </div>
            {/if}
          {/if}
        </li>
      {/each}
    </ol>
  {/if}

  {#if !expanded}
    <button
      type="button"
      class="reply-link"
      bind:this={opener}
      aria-label="Reply to {feedbackHandle(item.number)}"
      aria-expanded="false"
      onclick={openComposer}><Icon name="comment" />Reply</button
    >
  {:else}
  <form class="composer" class:dropping={tray.dragging} onsubmit={(e) => (e.preventDefault(), send())} {@attach tray.zone}>
    <div class="row">
      <textarea
        bind:this={field}
        aria-label="Reply to {feedbackHandle(item.number)}"
        rows="1"
        placeholder="Reply…"
        bind:value={draft}
        {onkeydown}
        disabled={sending}
        maxlength="5000"
      ></textarea>
      <Button small type="submit" disabled={!canSend}>{sending ? "Sending…" : "Reply"}</Button>
    </div>
    <AttachmentInput {tray} disabled={sending} label="the reply" />
  </form>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

{#snippet aiAuthor()}
  <span class="ai-author"><span class="ai-mark" aria-hidden="true"><Icon name="sparkle" /></span>{FEEDBACK_AI_AUTHOR_NAME}</span>
{/snippet}

{#snippet verdict(c: FeedbackComment)}
  {#if c.aiMeta}
    <span class="verdict">{AI_VERDICT_LABEL[c.aiMeta.verdict]}</span>
    <Pill tone={AI_CONFIDENCE_TONE[c.aiMeta.confidence]}>{AI_CONFIDENCE_LABEL[c.aiMeta.confidence]}</Pill>
  {/if}
{/snippet}

{#snippet draftCard(c: FeedbackComment)}
  <section class="ai-draft" aria-label="Unsent AI draft" aria-busy={busyId === c.id}>
    <div class="head">
      {@render aiAuthor()}
      <span class="tag">Draft · not sent</span>
      {@render when(c.createdAt)}
    </div>
    {#if editing === c.id}
      <textarea
        class="edit"
        aria-label="Edit the AI draft"
        bind:value={editText}
        maxlength="5000"
        disabled={busyId === c.id}
      ></textarea>
    {:else}
      <div class="body md">{@render html(c.body)}</div>
    {/if}
    <div class="actions">
      <Button small variant="primary" disabled={busyId !== null || (editing === c.id && !editText.trim())} onclick={() => sendDraft(c)}>
        {busyId === c.id ? "Sending…" : editing === c.id ? "Send edited" : "Send"}
      </Button>
      {#if editing === c.id}
        <Button small variant="ghost" disabled={busyId !== null} onclick={() => (editing = null)}>Cancel edit</Button>
      {:else}
        <Button small disabled={busyId !== null} onclick={() => startEdit(c)}>Edit</Button>
      {/if}
      <Button small variant="ghost" disabled={busyId !== null} onclick={() => discard(c)}>Discard</Button>
      <span class="hint">Only you see this until you send it.</span>
    </div>
    {#if aiError?.id === c.id}<p class="error" role="alert">{aiError.message}</p>{/if}
  </section>
{/snippet}

{#snippet note(c: FeedbackComment)}
  <section class="ai-note" aria-label="Private AI note">
    <div class="head">
      <span class="ai-note-label"><Icon name="lock" />AI triage note</span>
      {@render verdict(c)}
      {@render when(c.createdAt)}
      <span class="spacer"></span>
      <button type="button" class="dismiss" disabled={busyId !== null} onclick={() => discard(c)}>Dismiss</button>
    </div>
    <div class="body md">{@render html(c.body)}</div>
    {#if c.aiMeta?.risk || c.aiMeta?.fixPlan?.length}
      <div class="plan">
        <div class="plan-head">
          <span class="plan-label">Fix plan</span>
          {#if c.aiMeta.risk}<Pill tone={AI_RISK_TONE[c.aiMeta.risk]}>{AI_RISK_LABEL[c.aiMeta.risk]}</Pill>{/if}
        </div>
        {#if c.aiMeta.fixPlan?.length}
          <ol aria-label="Fix plan">
            {#each c.aiMeta.fixPlan as step, i (i)}<li>{step}</li>{/each}
          </ol>
        {/if}
      </div>
    {/if}
    {#if c.aiMeta?.citations.length}
      <ul class="cites" aria-label="Citations">
        {#each c.aiMeta.citations as cite (cite)}<li><code>{cite}</code></li>{/each}
      </ul>
    {/if}
    {#if aiError?.id === c.id}<p class="error" role="alert">{aiError.message}</p>{/if}
  </section>
{/snippet}

{#snippet html(body: string | null)}
  {@html renderSafeMarkdown(body)}
{/snippet}

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
    overflow-wrap: anywhere;
  }
  .md :global(p) {
    margin: 0 0 6px;
  }
  .md :global(:last-child) {
    margin-bottom: 0;
  }
  .md :global(ul),
  .md :global(ol) {
    margin: 0 0 6px;
    padding-left: 20px;
  }
  .md :global(code) {
    font: 12px/1.4 var(--font-mono);
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--chip-bg);
  }
  .md :global(a) {
    color: var(--blue);
  }

  /* AI author: the app's sparkle mark in a 20px disc, aligned with Author's avatar */
  .ai-author {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: 500 13px/1 var(--font-ui);
  }
  .ai-mark {
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 99px;
    background: var(--pulse-now-bg);
    color: var(--blue);
    flex: none;
  }
  .ai-mark :global(svg) {
    width: 12px;
    height: 12px;
  }
  /* Release author: a check in a green disc, the same footprint as an avatar */
  .release-author {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: 500 13px/1 var(--font-ui);
  }
  .release-mark {
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 99px;
    background: var(--good-bg);
    color: var(--good);
    flex: none;
  }
  .release-mark :global(svg) {
    width: 12px;
    height: 12px;
  }
  .sha {
    font: 11px/1.4 var(--font-mono);
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--chip-bg);
    color: var(--muted);
  }
  .dot.release {
    background: var(--good);
  }
  .ai-badge,
  .tag {
    font: 500 11px/1 var(--font-ui);
    padding: 3px 6px;
    border-radius: 99px;
    border: 1px solid var(--blue-line);
    color: var(--blue);
    background: var(--pulse-now-bg);
  }
  .tag {
    border-color: var(--warn-line);
    color: var(--warn-ink);
    background: var(--warn-bg);
  }
  .verdict {
    font: 500 12px/1 var(--font-ui);
    color: var(--ink);
  }

  /* Draft: dashed edge says "not out yet"; the body sits where a sent reply would */
  .ai-draft {
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius);
    padding: 8px 10px;
    background: var(--bg);
  }
  .ai-draft .head,
  .ai-note .head {
    flex-wrap: wrap;
  }
  .ai-draft .body,
  .ai-note .body {
    margin-left: 0;
    margin-top: 6px;
  }
  .edit {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin-top: 6px;
    field-sizing: content;
    min-height: 64px;
    max-height: 320px;
    font: 400 13px/1.5 var(--font-ui);
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    resize: vertical;
    color: var(--ink);
    background: var(--bg);
  }
  .edit:focus {
    outline: none;
    border-color: var(--blue);
    box-shadow: 0 0 0 3px var(--focus);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
  }
  .hint {
    font-size: 12px;
    color: var(--muted);
  }

  /* Private note: quiet well, smaller type — triage context, not conversation */
  .ai-note {
    border-radius: var(--radius);
    padding: 8px 10px;
    background: var(--well);
    font-size: 13px;
    color: var(--muted);
  }
  .ai-note .body {
    font-size: 13px;
    color: var(--ink);
  }
  .ai-note-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: 600 12px/1 var(--font-ui);
    color: var(--muted);
  }
  .ai-note-label :global(svg) {
    width: 12px;
    height: 12px;
  }
  .spacer {
    flex: 1;
  }
  .dismiss {
    appearance: none;
    background: none;
    border: 0;
    padding: 2px 4px;
    border-radius: 4px;
    font: 500 12px/1 var(--font-ui);
    color: var(--muted);
    cursor: pointer;
  }
  .dismiss:hover {
    color: var(--ink);
    background: var(--hover-soft);
  }
  .dismiss:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
  }
  .plan {
    margin-top: 8px;
  }
  .plan-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .plan-label {
    font: 600 12px/1 var(--font-ui);
    color: var(--muted);
  }
  .plan ol {
    margin: 6px 0 0;
    padding-left: 20px;
    color: var(--ink);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .plan li + li {
    margin-top: 2px;
  }
  .cites {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .cites code {
    font: 11px/1.4 var(--font-mono);
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--well-2);
    color: var(--ink);
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
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    background: none;
    border: 0;
    padding: 0;
    border-radius: 4px;
    font: 400 12px/1 var(--font-ui);
    color: var(--muted);
    cursor: default;
  }
  button.when:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
  }
  .composer {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  /* Collapsed composer: the thread ends with a quiet link. */
  .reply-link {
    appearance: none;
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 24px;
    padding: 2px 6px;
    margin-left: -6px;
    border: 0;
    border-radius: 4px;
    background: none;
    font: 600 12px/1.2 var(--font-ui);
    color: var(--blue);
    cursor: pointer;
  }
  .reply-link :global(svg) {
    width: 14px;
    height: 14px;
  }
  .reply-link:hover {
    background: var(--hover-soft);
  }
  .reply-link:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
  }
  .composer.dropping {
    outline: 2px dashed var(--blue);
    outline-offset: 3px;
    border-radius: var(--radius);
  }
  .composer .row {
    display: flex;
    align-items: flex-end;
    gap: 6px;
  }
  .images {
    margin-top: 6px;
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
