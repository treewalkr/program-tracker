<script lang="ts">
  import {
    FEEDBACK_ANSWER_COMMENT_MAX,
    FEEDBACK_ANSWER_TAGS,
    FEEDBACK_ANSWER_TAG_LABELS,
    type FeedbackAnswerRating,
    type FeedbackAnswerTag,
    type FeedbackComment,
    type FeedbackItem,
  } from "@pt/shared";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import ToggleChip from "$lib/ui/ToggleChip.svelte";
  import { feedbackApi } from "./client";
  import { ratingSummary } from "./ai";

  /**
   * The reporter's 👍/👎 on one sent AI answer, under it in the thread. Same
   * shape as the AI-output Verdict: two quiet icon buttons; 👍 saves at once,
   * 👎 opens a small tray for quick tags and an optional comment. A new
   * rating replaces the old. Anyone else on the ticket (the admin) sees the
   * reporter's rating read-only, or nothing when there is none.
   */
  interface Props {
    itemId: string;
    /** A sent AI answer (carries `aiPublic`). */
    answer: FeedbackComment;
    /** Who rates — the ticket's reporter — for the read-only line. */
    reporterName?: string | null;
    /** The item after a rating is saved. */
    onchange?: (next: FeedbackItem) => void;
  }
  let { itemId, answer, reporterName = null, onchange }: Props = $props();

  /** Saved here before the parent refreshes `answer`. */
  let saved = $state<FeedbackAnswerRating | null>(null);
  const rating = $derived(saved ?? answer.aiPublic?.rating ?? null);
  const canRate = $derived(answer.aiPublic?.canRate ?? false);
  const isUp = $derived(rating?.score === 1);
  const isDown = $derived(rating?.score === -1);

  let open = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let tags = $state<FeedbackAnswerTag[]>([]);
  let comment = $state("");
  /** Just sent a 👎: say what happens next. */
  let thanked = $state(false);

  async function save(score: 1 | -1) {
    saving = true;
    error = null;
    try {
      const body = score === -1 ? { score, tags: [...tags], ...(comment.trim() ? { comment: comment.trim() } : {}) } : { score };
      const next = await feedbackApi.rateAnswer(itemId, answer.id, body);
      saved = next.thread.find((c) => c.id === answer.id)?.aiPublic?.rating ?? null;
      open = false;
      thanked = score === -1;
      onchange?.(next);
    } catch (err) {
      error = err instanceof Error ? err.message : "Not saved";
    } finally {
      saving = false;
    }
  }

  function up() {
    if (isUp || saving) return;
    open = false;
    void save(1);
  }

  function down() {
    if (open) {
      open = false;
      return;
    }
    tags = isDown ? [...rating!.tags] : [];
    comment = isDown ? (rating!.comment ?? "") : "";
    error = null;
    open = true;
  }

  const toggle = (tag: FeedbackAnswerTag) => (tags = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
  const summary = $derived(isDown && !open && rating ? ratingSummary(rating) : "");
</script>

{#if canRate}
  <div class="rating">
    <div class="row" role="group" aria-label="Rate this answer">
      <span class="ask">{rating ? "Your rating" : "Did this help?"}</span>
      <button
        type="button"
        class="thumb"
        class:up={isUp}
        aria-pressed={isUp}
        aria-label="Helpful"
        title="Helpful"
        disabled={saving}
        onclick={up}
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
        aria-label="Not helpful"
        title="Not helpful"
        disabled={saving}
        onclick={down}
      >
        <Icon name="thumbs-down" />
      </button>
      {#if summary}<span class="summary">{summary}</span>{/if}
      {#if thanked && isDown && !open}<span class="thanks" role="status">Thanks — we'll take another look.</span>{/if}
      {#if error && !open}<span class="err" role="alert">{error}</span>{/if}
    </div>

    {#if open}
      <div class="tray">
        <span class="ask">What was wrong? Optional.</span>
        <div class="chips">
          {#each FEEDBACK_ANSWER_TAGS as tag (tag)}
            <ToggleChip on={tags.includes(tag)} onclick={() => toggle(tag)}>{FEEDBACK_ANSWER_TAG_LABELS[tag]}</ToggleChip>
          {/each}
        </div>
        <input
          class="input note"
          placeholder="Tell us more (optional)"
          aria-label="What was wrong"
          maxlength={FEEDBACK_ANSWER_COMMENT_MAX}
          bind:value={comment}
          onkeydown={(e) => {
            if (e.key === "Enter" && !e.isComposing) void save(-1);
            if (e.key === "Escape") open = false;
          }}
        />
        <div class="actions">
          <Button small disabled={saving} onclick={() => save(-1)}>{saving ? "Saving…" : "Send"}</Button>
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
      {rating.score === 1 ? "found this helpful" : "found this unhelpful"}{#if rating.score === -1 && ratingSummary(rating)}<span class="why">&nbsp;· {ratingSummary(rating)}</span>{/if}
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
  .summary,
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
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .note {
    width: 100%;
    font-size: 13px;
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
