<script lang="ts">
  import InputField from "$lib/ui/InputField.svelte";
  import { FEEDBACK_FIX_COMMENT_MAX, type FeedbackComment, type FeedbackFixRating, type FeedbackItem } from "@pt/shared";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import { feedbackApi } from "./client";

  /**
   * "Fixed for you?" under a release's shipped note — the reporter's 👍/👎 on
   * the fix itself (the AnswerRating pattern). 👍 saves at once; 👎 opens a
   * small tray for an optional "what's still wrong", then reopens the ticket
   * and posts it as their reply. A new rating replaces the old; there is no
   * taking a 👎 back (the ticket is already open again). Anyone else on the
   * ticket sees the reporter's rating read-only, or nothing.
   */
  interface Props {
    itemId: string;
    /** A release's shipped note (carries `fixPublic`). */
    note: FeedbackComment;
    reporterName?: string | null;
    /** The item after a rating is saved. */
    onchange?: (next: FeedbackItem) => void;
  }
  let { itemId, note, reporterName = null, onchange }: Props = $props();

  let saved = $state<FeedbackFixRating | null | undefined>(undefined);
  const rating = $derived(saved !== undefined ? saved : (note.fixPublic?.rating ?? null));
  const canRate = $derived(note.fixPublic?.canRate ?? false);
  const isUp = $derived(rating?.score === 1);
  const isDown = $derived(rating?.score === -1);

  let open = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let comment = $state("");
  /** Just sent a 👎: say what happens next. */
  let reopened = $state(false);

  async function save(score: 1 | -1) {
    saving = true;
    error = null;
    try {
      const body = score === -1 && comment.trim() ? { score, comment: comment.trim() } : { score };
      const next = await feedbackApi.rateFix(itemId, note.id, body);
      saved = next.thread.find((c) => c.id === note.id)?.fixPublic?.rating ?? null;
      open = false;
      reopened = score === -1;
      onchange?.(next);
    } catch (err) {
      error = err instanceof Error ? err.message : "Not saved";
    } finally {
      saving = false;
    }
  }

  function down() {
    if (open) {
      open = false;
      return;
    }
    comment = isDown ? (rating!.comment ?? "") : "";
    error = null;
    open = true;
  }
</script>

{#if canRate}
  <div class="rating">
    <div class="row" role="group" aria-label="Rate the fix">
      <span class="ask">{rating ? "Your rating of the fix" : "Fixed for you?"}</span>
      <button
        type="button"
        class="thumb"
        class:up={isUp}
        aria-pressed={isUp}
        aria-label="Fixed"
        title="Fixed"
        disabled={saving || isUp}
        onclick={() => {
          open = false;
          void save(1);
        }}
      >
        <Icon name="thumbs-up" />
      </button>
      <button
        type="button"
        class="thumb"
        class:down={isDown}
        class:open
        aria-pressed={isDown}
        aria-expanded={open}
        aria-label="Not fixed"
        title="Not fixed"
        disabled={saving}
        onclick={down}
      >
        <Icon name="thumbs-down" />
      </button>
      {#if reopened && isDown && !open}<span class="thanks" role="status">Thanks — it's open again and we'll take another look.</span>{/if}
      {#if error && !open}<span class="err" role="alert">{error}</span>{/if}
    </div>

    {#if open}
      <div class="tray">
        <span class="ask">What's still wrong? Optional — it goes on the ticket as your reply.</span>
        <InputField
          hideLabel
          label="What's still wrong"
          placeholder="e.g. still too small on my phone"
          maxlength={FEEDBACK_FIX_COMMENT_MAX}
          bind:value={comment}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.isComposing) void save(-1);
            if (e.key === "Escape") open = false;
          }}
        />
        <div class="actions">
          <Button small disabled={saving} onclick={() => save(-1)}>{saving ? "Saving…" : "Not fixed — reopen"}</Button>
          <Button small variant="ghost" disabled={saving} onclick={() => (open = false)}>Cancel</Button>
          {#if error}<span class="err" role="alert">{error}</span>{/if}
        </div>
      </div>
    {/if}
  </div>
{:else if rating}
  <p class="rated" class:down={rating.score === -1}>
    <span class="mark" aria-hidden="true"><Icon name={rating.score === 1 ? "thumbs-up" : "thumbs-down"} /></span>
    <span>
      {reporterName ?? "The reporter"}
      {rating.score === 1 ? "says it's fixed" : "says it isn't fixed"}{#if rating.comment}<span class="why">&nbsp;· “{rating.comment}”</span>{/if}
    </span>
  </p>
{/if}

<style>
  .rating {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .ask {
    margin-right: 4px;
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
  }
  .thumb {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--faint);
    cursor: pointer;
    transition: background-color 120ms, color 120ms;
  }
  .thumb :global(svg) {
    width: 14px;
    height: 14px;
  }
  .thumb:hover:not(:disabled),
  .thumb.open {
    background: var(--well-2);
    color: var(--ink);
  }
  .thumb:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
  }
  .thumb:disabled {
    cursor: progress;
  }
  .thumb.up {
    color: var(--good);
    background: var(--good-bg);
    border-color: var(--good-line);
  }
  .thumb.down {
    color: var(--bad);
    background: var(--bad-bg);
    border-color: var(--bad-line);
  }
  .thanks {
    margin-left: 6px;
    font-size: 12px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .tray {
    display: grid;
    gap: 8px;
    max-width: 560px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .err {
    font-size: 12px;
    font-weight: 500;
    color: var(--bad);
  }

  /* Read-only: the reporter's verdict as a quiet line, the thumb carrying the colour */
  .rated {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .mark {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 99px;
    color: var(--good);
    background: var(--good-bg);
  }
  .rated.down .mark {
    color: var(--bad);
    background: var(--bad-bg);
  }
  .mark :global(svg) {
    width: 11px;
    height: 11px;
  }
  .why {
    color: var(--ink);
  }
  @media (prefers-reduced-motion: reduce) {
    .thumb {
      transition: none;
    }
  }
</style>
